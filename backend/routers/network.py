import asyncio
import json
import re
import shutil
import socket
import time
from typing import Optional

import psutil
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from models.envelope import ok, fail
from utils.sse import sse_event
from utils.subprocess_runner import run_cmd
from utils.validators import (
    validate_host,
    validate_hostname,
    validate_iface,
    validate_ip,
    validate_vlan_id,
)
from utils import vlan_members
from utils.network_scanner import build_network_map

router = APIRouter(prefix="/api/network", tags=["Network"])


# ---------- Network Map (Device Discovery) ----------

@router.get("/map")
async def network_map_passive():
    """Return the current ARP cache and gateway info (no active probing)."""
    try:
        result = await build_network_map(active_scan=False)
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


class ScanBody(BaseModel):
    confirm: bool = Field(False, description="Confirm active network scan")


@router.post("/map/scan")
async def network_map_scan(body: ScanBody):
    """Run a ping sweep across local subnets, then return the full network map."""
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail=fail("Active scan requires confirmation: set confirm=true"),
        )
    try:
        result = await build_network_map(active_scan=True)
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


# ---------- Interfaces ----------

@router.get("/interfaces")
def list_interfaces():
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        interfaces = []
        for name, addr_list in addrs.items():
            ipv4, ipv6, mac = [], [], None
            for a in addr_list:
                if a.family == socket.AF_INET:
                    ipv4.append(a.address)
                elif a.family == socket.AF_INET6:
                    ipv6.append(a.address.split("%")[0])
                elif a.family == psutil.AF_LINK:
                    mac = a.address
            stat = stats.get(name)
            interfaces.append({
                "name": name,
                "mac": mac,
                "ipv4": ipv4,
                "ipv6": ipv6,
                "is_up": bool(stat.isup) if stat else False,
                "speed_mbps": int(stat.speed) if stat else 0,
                "mtu": int(stat.mtu) if stat else 0,
                "duplex": str(stat.duplex.name) if stat and hasattr(stat.duplex, "name") else "",
            })
        return ok(interfaces)
    except Exception as exc:
        return fail(str(exc))


# ---------- Routes ----------

@router.get("/routes")
def list_routes():
    if not shutil.which("ip"):
        return fail("'ip' tool not installed")
    success, output = run_cmd(["ip", "-j", "route"])
    if success:
        try:
            data = json.loads(output)
            return ok(data)
        except json.JSONDecodeError:
            pass
    success, output = run_cmd(["ip", "route"])
    if not success:
        return fail(output)
    routes = []
    for line in output.splitlines():
        parts = line.split()
        entry = {"raw": line}
        if parts:
            entry["dst"] = parts[0]
        for i, p in enumerate(parts):
            if p == "via" and i + 1 < len(parts):
                entry["gateway"] = parts[i + 1]
            elif p == "dev" and i + 1 < len(parts):
                entry["dev"] = parts[i + 1]
            elif p == "proto" and i + 1 < len(parts):
                entry["proto"] = parts[i + 1]
            elif p == "scope" and i + 1 < len(parts):
                entry["scope"] = parts[i + 1]
        routes.append(entry)
    return ok(routes)


# ---------- Ping ----------

class PingBody(BaseModel):
    host: str = Field(..., max_length=253)
    count: int = Field(4, ge=1, le=20)


@router.post("/ping")
async def ping_host(body: PingBody, request: Request):
    if not validate_host(body.host):
        raise HTTPException(status_code=400, detail=fail("Invalid host"))
    if not shutil.which("ping"):
        raise HTTPException(status_code=500, detail=fail("'ping' not installed"))

    args = ["ping", "-c", str(body.count), "-W", "3", body.host]

    async def gen():
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            while True:
                if await request.is_disconnected():
                    break
                line = await proc.stdout.readline()
                if not line:
                    if proc.returncode is not None:
                        break
                    await asyncio.sleep(0.05)
                    continue
                yield sse_event("line", {"line": line.decode("utf-8", errors="replace").rstrip(), "ts": time.time()})
            yield sse_event("done", {"return_code": proc.returncode or 0})
        finally:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass

    return EventSourceResponse(gen())


# ---------- Traceroute ----------

class TracerouteBody(BaseModel):
    host: str = Field(..., max_length=253)
    max_hops: int = Field(20, ge=1, le=64)


@router.post("/traceroute")
async def traceroute_host(body: TracerouteBody, request: Request):
    if not validate_host(body.host):
        raise HTTPException(status_code=400, detail=fail("Invalid host"))
    tool = "traceroute" if shutil.which("traceroute") else ("tracepath" if shutil.which("tracepath") else None)
    if not tool:
        raise HTTPException(status_code=500, detail=fail("Neither 'traceroute' nor 'tracepath' installed"))

    if tool == "traceroute":
        args = ["traceroute", "-n", "-m", str(body.max_hops), body.host]
    else:
        args = ["tracepath", body.host]

    async def gen():
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            while True:
                if await request.is_disconnected():
                    break
                line = await proc.stdout.readline()
                if not line:
                    if proc.returncode is not None:
                        break
                    await asyncio.sleep(0.05)
                    continue
                yield sse_event("line", {"line": line.decode("utf-8", errors="replace").rstrip(), "ts": time.time()})
            yield sse_event("done", {"return_code": proc.returncode or 0})
        finally:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass

    return EventSourceResponse(gen())


# ---------- Connections (ss) ----------

_SS_LINE = re.compile(
    r"^(?P<proto>\S+)\s+(?P<state>\S+)\s+\S+\s+\S+\s+(?P<laddr>\S+)\s+(?P<raddr>\S+)(?:\s+(?P<extra>.*))?$"
)
_SS_PROC = re.compile(r'users:\(\("(?P<name>[^"]+)",pid=(?P<pid>\d+)')


@router.get("/connections")
def list_connections():
    if not shutil.which("ss"):
        return fail("'ss' tool not installed")
    success, output = run_cmd(["ss", "-tulnpH"], timeout=10)
    if not success:
        return fail(output)
    rows = []
    for line in output.splitlines():
        parts = line.split(None, 5)
        if len(parts) < 5:
            continue
        proto = parts[0]
        state = parts[1] if proto.lower() != "udp" else "UNCONN"
        laddr = parts[4] if proto.lower() == "udp" else parts[4]
        raddr = parts[5].split()[0] if len(parts) > 5 else ""
        proc_info = None
        m = _SS_PROC.search(line)
        if m:
            proc_info = {"name": m.group("name"), "pid": int(m.group("pid"))}
        rows.append({
            "proto": proto,
            "state": state,
            "local_address": laddr,
            "remote_address": raddr,
            "process": proc_info,
        })
    return ok(rows)


# ---------- VLANs ----------

@router.get("/vlans")
def list_vlans():
    if not shutil.which("ip"):
        return fail("'ip' tool not installed")
    success, output = run_cmd(["ip", "-j", "-d", "link", "show", "type", "vlan"])
    if not success:
        return fail(output)
    try:
        data = json.loads(output) if output.strip() else []
        rows = []
        for item in data:
            linkinfo = (item.get("linkinfo") or {}).get("info_data", {}) or {}
            rows.append({
                "name": item.get("ifname", ""),
                "parent": item.get("link", ""),
                "vlan_id": linkinfo.get("id"),
                "operstate": item.get("operstate", ""),
                "address": item.get("address", ""),
                "mtu": item.get("mtu", 0),
            })
        return ok(rows)
    except json.JSONDecodeError:
        return fail("Failed to parse VLAN data")


class CreateVlanBody(BaseModel):
    parent: str = Field(..., max_length=15)
    vlan_id: int = Field(..., ge=1, le=4094)
    name: Optional[str] = Field(None, max_length=15)
    confirm: bool = False


@router.post("/vlans")
def create_vlan(body: CreateVlanBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_iface(body.parent):
        raise HTTPException(status_code=400, detail=fail("Invalid parent interface"))
    if not validate_vlan_id(body.vlan_id):
        raise HTTPException(status_code=400, detail=fail("Invalid VLAN id"))
    name = body.name or f"{body.parent}.{body.vlan_id}"
    if not validate_iface(name):
        raise HTTPException(status_code=400, detail=fail("Invalid VLAN interface name"))
    if not shutil.which("ip"):
        return fail("'ip' tool not installed")
    success, output = run_cmd([
        "ip", "link", "add", "link", body.parent, "name", name, "type", "vlan", "id", str(body.vlan_id),
    ])
    if not success:
        return fail(output)
    run_cmd(["ip", "link", "set", "dev", name, "up"])
    return ok({"name": name, "parent": body.parent, "vlan_id": body.vlan_id, "message": "VLAN created"})


class DeleteVlanBody(BaseModel):
    confirm: bool = False


@router.delete("/vlans/{name}")
def delete_vlan(name: str, body: DeleteVlanBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_iface(name):
        raise HTTPException(status_code=400, detail=fail("Invalid VLAN name"))
    if not shutil.which("ip"):
        return fail("'ip' tool not installed")
    success, output = run_cmd(["ip", "link", "delete", name])
    if not success:
        return fail(output)
    return ok({"name": name, "message": "VLAN removed"})


# ---------- VLAN Members (logical membership, stored in BACKEND_DATA_DIR) ----------

MEMBER_NAME_MAX = 64
MEMBER_NOTE_MAX = 256


def _validate_member_payload(name: str, vlan: str, ip: Optional[str], mac: Optional[str], note: Optional[str]) -> Optional[str]:
    if not name or len(name) > MEMBER_NAME_MAX:
        return "name required (max 64 chars)"
    if any(ch in name for ch in "\n\r\t"):
        return "name contains invalid characters"
    if not vlan or not validate_iface(vlan):
        return "invalid vlan name"
    if ip and not validate_ip(ip):
        return "invalid ip"
    if mac:
        # very loose MAC validation: 6 hex pairs separated by : or -
        if not re.fullmatch(r"^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$", mac):
            return "invalid mac"
    if note is not None and len(note) > MEMBER_NOTE_MAX:
        return "note too long"
    if note is not None and any(ch in note for ch in "\n\r"):
        return "note contains invalid characters"
    return None


@router.get("/vlan-members")
def list_members():
    return ok(vlan_members.list_all())


class CreateMemberBody(BaseModel):
    name: str = Field(..., max_length=MEMBER_NAME_MAX)
    vlan: str = Field(..., max_length=15)
    ip: Optional[str] = Field(None, max_length=64)
    mac: Optional[str] = Field(None, max_length=32)
    note: Optional[str] = Field(None, max_length=MEMBER_NOTE_MAX)


@router.post("/vlan-members")
def add_member(body: CreateMemberBody):
    err = _validate_member_payload(body.name, body.vlan, body.ip, body.mac, body.note)
    if err:
        raise HTTPException(status_code=400, detail=fail(err))
    item = vlan_members.add(name=body.name, vlan=body.vlan, ip=body.ip, mac=body.mac, note=body.note)
    return ok(item)


class UpdateMemberBody(BaseModel):
    name: Optional[str] = Field(None, max_length=MEMBER_NAME_MAX)
    vlan: Optional[str] = Field(None, max_length=15)
    ip: Optional[str] = Field(None, max_length=64)
    mac: Optional[str] = Field(None, max_length=32)
    note: Optional[str] = Field(None, max_length=MEMBER_NOTE_MAX)


@router.put("/vlan-members/{member_id}")
def update_member(member_id: str, body: UpdateMemberBody):
    if len(member_id) > 64 or not re.fullmatch(r"^[a-f0-9]+$", member_id):
        raise HTTPException(status_code=400, detail=fail("invalid id"))
    current = next((m for m in vlan_members.list_all() if m["id"] == member_id), None)
    if not current:
        raise HTTPException(status_code=404, detail=fail("member not found"))
    name = body.name if body.name is not None else current["name"]
    vlan = body.vlan if body.vlan is not None else current["vlan"]
    ip = body.ip if body.ip is not None else current.get("ip", "")
    mac = body.mac if body.mac is not None else current.get("mac", "")
    note = body.note if body.note is not None else current.get("note", "")
    err = _validate_member_payload(name, vlan, ip, mac, note)
    if err:
        raise HTTPException(status_code=400, detail=fail(err))
    updated = vlan_members.update(member_id, {"name": name, "vlan": vlan, "ip": ip, "mac": mac, "note": note})
    return ok(updated)


@router.delete("/vlan-members/{member_id}")
def delete_member(member_id: str):
    if not re.fullmatch(r"^[a-f0-9]+$", member_id):
        raise HTTPException(status_code=400, detail=fail("invalid id"))
    if not vlan_members.remove(member_id):
        raise HTTPException(status_code=404, detail=fail("member not found"))
    return ok({"id": member_id, "message": "member removed"})


# ---------- Tailscale & Cloudflare (kept) ----------

@router.get("/tailscale/peers")
def tailscale_peers():
    if not shutil.which("tailscale"):
        return fail("Tailscale not installed")
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
    if not shutil.which("cloudflared"):
        return fail("cloudflared not installed")
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
