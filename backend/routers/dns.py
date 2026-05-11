import json
import os
import shutil
import socket
import ssl
import tempfile
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models.envelope import ok, fail
from utils.subprocess_runner import run_cmd
from utils.validators import (
    validate_dns_type,
    validate_host,
    validate_hostname,
    validate_ip,
)

router = APIRouter(prefix="/api/dns", tags=["DNS & Domains"])

HOSTS_PATH = "/etc/hosts"
TRAEFIK_API_URL = os.environ.get("TRAEFIK_API_URL", "http://localhost:8080")
TRAEFIK_ACME_PATH = os.environ.get("TRAEFIK_ACME_PATH", "/etc/traefik/acme.json")
ALLOWED_ACME_PREFIXES = ("/etc/traefik/", "/opt/traefik/")


# ---------- /etc/hosts ----------

def _parse_hosts_file() -> list[dict]:
    if not os.path.exists(HOSTS_PATH):
        return []
    entries = []
    try:
        with open(HOSTS_PATH, "r", errors="replace") as f:
            for idx, raw in enumerate(f.readlines(), start=1):
                line = raw.rstrip("\n")
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                comment = ""
                if "#" in line:
                    body, _, comment = line.partition("#")
                else:
                    body = line
                parts = body.split()
                if len(parts) < 2:
                    continue
                entries.append({
                    "line_no": idx,
                    "ip": parts[0],
                    "hostnames": parts[1:],
                    "comment": comment.strip(),
                })
    except OSError as exc:
        raise HTTPException(status_code=500, detail=fail(str(exc)))
    return entries


def _write_hosts_atomic(content: str) -> None:
    dir_ = os.path.dirname(HOSTS_PATH)
    fd, tmp_path = tempfile.mkstemp(dir=dir_, prefix=".hosts.")
    try:
        with os.fdopen(fd, "w") as tmp:
            tmp.write(content)
        os.chmod(tmp_path, 0o644)
        os.replace(tmp_path, HOSTS_PATH)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def _read_hosts_lines() -> list[str]:
    if not os.path.exists(HOSTS_PATH):
        return []
    with open(HOSTS_PATH, "r", errors="replace") as f:
        return f.readlines()


@router.get("/hosts")
def list_hosts():
    try:
        return ok(_parse_hosts_file())
    except HTTPException:
        raise
    except Exception as exc:
        return fail(str(exc))


class AddHostBody(BaseModel):
    ip: str = Field(..., max_length=64)
    hostnames: list[str] = Field(..., min_length=1, max_length=16)
    comment: Optional[str] = Field(None, max_length=128)
    confirm: bool = False


@router.post("/hosts")
def add_host(body: AddHostBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_ip(body.ip):
        raise HTTPException(status_code=400, detail=fail("Invalid IP address"))
    for h in body.hostnames:
        if not validate_hostname(h):
            raise HTTPException(status_code=400, detail=fail(f"Invalid hostname: {h}"))
    if body.comment and ("\n" in body.comment or "\r" in body.comment):
        raise HTTPException(status_code=400, detail=fail("Invalid comment"))
    try:
        lines = _read_hosts_lines()
        if lines and not lines[-1].endswith("\n"):
            lines[-1] = lines[-1] + "\n"
        new_line = f"{body.ip}\t{' '.join(body.hostnames)}"
        if body.comment:
            new_line += f"  # {body.comment}"
        new_line += "\n"
        lines.append(new_line)
        _write_hosts_atomic("".join(lines))
        return ok({"message": "Entry added"})
    except PermissionError:
        return fail(f"Permission denied writing {HOSTS_PATH}")
    except Exception as exc:
        return fail(str(exc))


class UpdateHostBody(BaseModel):
    ip: str = Field(..., max_length=64)
    hostnames: list[str] = Field(..., min_length=1, max_length=16)
    comment: Optional[str] = Field(None, max_length=128)
    confirm: bool = False


@router.put("/hosts/{line_no}")
def update_host(line_no: int, body: UpdateHostBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_ip(body.ip):
        raise HTTPException(status_code=400, detail=fail("Invalid IP address"))
    for h in body.hostnames:
        if not validate_hostname(h):
            raise HTTPException(status_code=400, detail=fail(f"Invalid hostname: {h}"))
    if body.comment and ("\n" in body.comment or "\r" in body.comment):
        raise HTTPException(status_code=400, detail=fail("Invalid comment"))
    try:
        lines = _read_hosts_lines()
        if line_no < 1 or line_no > len(lines):
            raise HTTPException(status_code=404, detail=fail("Line not found"))
        new_line = f"{body.ip}\t{' '.join(body.hostnames)}"
        if body.comment:
            new_line += f"  # {body.comment}"
        new_line += "\n"
        lines[line_no - 1] = new_line
        _write_hosts_atomic("".join(lines))
        return ok({"message": "Entry updated"})
    except HTTPException:
        raise
    except PermissionError:
        return fail(f"Permission denied writing {HOSTS_PATH}")
    except Exception as exc:
        return fail(str(exc))


class DeleteHostBody(BaseModel):
    confirm: bool = False


@router.delete("/hosts/{line_no}")
def delete_host(line_no: int, body: DeleteHostBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    try:
        lines = _read_hosts_lines()
        if line_no < 1 or line_no > len(lines):
            raise HTTPException(status_code=404, detail=fail("Line not found"))
        del lines[line_no - 1]
        _write_hosts_atomic("".join(lines))
        return ok({"message": "Entry removed"})
    except HTTPException:
        raise
    except PermissionError:
        return fail(f"Permission denied writing {HOSTS_PATH}")
    except Exception as exc:
        return fail(str(exc))


# ---------- Resolve ----------

class ResolveBody(BaseModel):
    name: str = Field(..., max_length=253)
    type: str = Field("A", max_length=8)


@router.post("/resolve")
def resolve(body: ResolveBody):
    if not validate_hostname(body.name):
        raise HTTPException(status_code=400, detail=fail("Invalid hostname"))
    rtype = body.type.upper()
    if not validate_dns_type(rtype):
        raise HTTPException(status_code=400, detail=fail("Invalid record type"))

    if shutil.which("dig"):
        success, output = run_cmd(["dig", "+short", "+timeout=3", body.name, rtype], timeout=10)
        if not success:
            return fail(output)
        records = [l for l in output.splitlines() if l.strip()]
        return ok({"name": body.name, "type": rtype, "records": records, "tool": "dig"})

    # Fallback: socket resolution for A/AAAA only
    if rtype in ("A", "AAAA"):
        try:
            family = socket.AF_INET if rtype == "A" else socket.AF_INET6
            results = socket.getaddrinfo(body.name, None, family=family)
            records = sorted({r[4][0] for r in results})
            return ok({"name": body.name, "type": rtype, "records": records, "tool": "getaddrinfo"})
        except socket.gaierror as exc:
            return fail(str(exc))
    return fail("'dig' not installed and fallback supports only A/AAAA")


# ---------- SSL Check ----------

class SslCheckBody(BaseModel):
    host: str = Field(..., max_length=253)
    port: int = Field(443, ge=1, le=65535)


@router.post("/ssl-check")
def ssl_check(body: SslCheckBody):
    if not validate_host(body.host):
        raise HTTPException(status_code=400, detail=fail("Invalid host"))
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with socket.create_connection((body.host, body.port), timeout=8) as sock:
            with ctx.wrap_socket(sock, server_hostname=body.host) as ssock:
                cert_der = ssock.getpeercert(binary_form=True)
        try:
            from cryptography import x509
            from cryptography.hazmat.backends import default_backend
            cert = x509.load_der_x509_certificate(cert_der, default_backend())
            not_before = cert.not_valid_before_utc.isoformat()
            not_after = cert.not_valid_after_utc.isoformat()
            now = datetime.now(timezone.utc)
            days_left = (cert.not_valid_after_utc - now).days
            issuer = cert.issuer.rfc4514_string()
            subject = cert.subject.rfc4514_string()
            sans: list[str] = []
            try:
                ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
                sans = [n.value for n in ext.value]
            except x509.ExtensionNotFound:
                sans = []
            return ok({
                "host": body.host,
                "port": body.port,
                "not_before": not_before,
                "not_after": not_after,
                "days_left": days_left,
                "issuer": issuer,
                "subject": subject,
                "sans": sans,
            })
        except ImportError:
            return fail("cryptography library not available for cert parsing")
    except (socket.gaierror, socket.timeout, ConnectionRefusedError, OSError) as exc:
        return fail(f"TLS connection failed: {exc}")
    except ssl.SSLError as exc:
        return fail(f"SSL error: {exc}")


# ---------- Traefik (moved from network) ----------

@router.get("/traefik/routes")
async def traefik_routes():
    url = f"{TRAEFIK_API_URL}/api/http/routers"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            routers_data = resp.json()
        result = []
        for r in routers_data:
            result.append({
                "name": r.get("name", ""),
                "rule": r.get("rule", ""),
                "service": r.get("service", ""),
                "entrypoints": r.get("entryPoints", []),
                "tls": bool(r.get("tls")),
                "status": r.get("status", ""),
            })
        return ok(result)
    except httpx.ConnectError:
        return fail("Traefik API not reachable")
    except Exception as exc:
        return fail(f"Traefik error: {exc}")


@router.get("/traefik/certificates")
def traefik_certificates():
    real_path = os.path.realpath(TRAEFIK_ACME_PATH)
    if not any(real_path.startswith(prefix) for prefix in ALLOWED_ACME_PREFIXES):
        return fail(f"ACME path must be under {' or '.join(ALLOWED_ACME_PREFIXES)}")
    if not os.path.exists(real_path):
        return fail(f"ACME file not found at {TRAEFIK_ACME_PATH}")
    try:
        with open(real_path, "r", encoding="utf-8") as f:
            acme_data = json.load(f)
        certs = []
        for resolver_name, resolver_data in acme_data.items():
            if not isinstance(resolver_data, dict):
                continue
            for cert_entry in resolver_data.get("Certificates", []) or []:
                domain = cert_entry.get("domain", {})
                certs.append({
                    "domain": domain.get("main", "unknown"),
                    "sans": domain.get("sans", []),
                    "resolver": resolver_name,
                })
        return ok(certs)
    except json.JSONDecodeError:
        return fail("Invalid JSON in ACME file")
    except PermissionError:
        return fail(f"Permission denied reading {TRAEFIK_ACME_PATH}")
    except Exception as exc:
        return fail(str(exc))
