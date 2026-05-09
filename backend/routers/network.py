import json
import os

import httpx
from fastapi import APIRouter

from models.envelope import ok, fail
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/network", tags=["Network"])

TRAEFIK_API_URL = os.environ.get("TRAEFIK_API_URL", "http://localhost:8080")
TRAEFIK_ACME_PATH = os.environ.get("TRAEFIK_ACME_PATH", "/etc/traefik/acme.json")
ALLOWED_ACME_PREFIXES = ("/etc/traefik/", "/opt/traefik/")


@router.get("/traefik/routes")
async def traefik_routes():
    url = f"{TRAEFIK_API_URL}/api/http/routers"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            routers = resp.json()

        result = []
        for r in routers:
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


@router.get("/certificates")
def tls_certificates():
    # Path traversal protection
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
            certificates = resolver_data.get("Certificates", [])
            for cert_entry in certificates:
                domain = cert_entry.get("domain", {})
                main_domain = domain.get("main", "unknown")
                # Parse certificate to get expiry (simplified — real parsing needs cryptography lib)
                certs.append({
                    "domain": main_domain,
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


@router.get("/tailscale/peers")
def tailscale_peers():
    success, output = run_cmd(["tailscale", "status", "--json"])
    if not success:
        return fail(f"Tailscale not available: {output}")

    try:
        data = json.loads(output)
        peers = []
        peer_map = data.get("Peer", {})
        for _peer_id, peer in peer_map.items():
            peers.append({
                "name": peer.get("HostName", ""),
                "dns_name": peer.get("DNSName", ""),
                "ip": peer.get("TailscaleIPs", [""])[0] if peer.get("TailscaleIPs") else "",
                "os": peer.get("OS", ""),
                "last_seen": peer.get("LastSeen", ""),
                "online": peer.get("Online", False),
                "exit_node": peer.get("ExitNode", False),
            })
        return ok(peers)
    except json.JSONDecodeError:
        return fail("Failed to parse tailscale output")


@router.get("/cloudflare/tunnels")
def cloudflare_tunnels():
    success, output = run_cmd(["cloudflared", "tunnel", "list", "--output", "json"])
    if not success:
        return fail(f"cloudflared not available: {output}")

    try:
        tunnels_data = json.loads(output)
        tunnels = []
        for t in tunnels_data:
            connections = t.get("connections", [])
            tunnels.append({
                "id": t.get("id", ""),
                "name": t.get("name", ""),
                "created_at": t.get("created_at", ""),
                "status": "active" if connections else "inactive",
                "connections_count": len(connections),
            })
        return ok(tunnels)
    except json.JSONDecodeError:
        return fail("Failed to parse cloudflared output")
