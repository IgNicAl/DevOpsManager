"""Network discovery engine.

Uses the host's kernel data (via pid: "host") to map all devices on the LAN.

Strategy:
  1. Read /proc/1/net/route → identify gateways and local subnets
  2. Async ping sweep via nsenter (host network namespace) → populate ARP cache
  3. Read /proc/1/net/arp → harvest discovered devices
  4. Enrich with OUI vendor lookup and gateway classification
"""

import asyncio
import ipaddress
import logging
import os
import shutil
import subprocess
import time
from typing import Optional

from utils.oui_lookup import lookup_vendor

_nsenter_cache: Optional[bool] = None

logger = logging.getLogger(__name__)

# Proc paths — PID 1 belongs to the host init when pid: "host" is set
_PROC_PATHS = ["/proc/1/net", "/host/root/proc/net", "/proc/net"]

_SWEEP_SEMAPHORE = 50  # max concurrent pings
_PING_TIMEOUT_S = "1"  # per-host timeout
_MAX_SUBNET_PREFIX = 20  # won't scan anything larger than /20 (4094 hosts)


def _find_proc(filename: str) -> str:
    for base in _PROC_PATHS:
        path = f"{base}/{filename}"
        if os.path.isfile(path):
            return path
    return f"/proc/net/{filename}"


# ---------------------------------------------------------------------------
# ARP table
# ---------------------------------------------------------------------------

def read_arp_table() -> list[dict]:
    """Parse the host kernel ARP table.

    /proc/net/arp format:
      IP address       HW type  Flags  HW address            Mask  Device
      192.168.1.1      0x1      0x2    aa:bb:cc:dd:ee:ff     *     eth0
    """
    path = _find_proc("arp")
    entries: list[dict] = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh.readlines()[1:]:  # skip header
                parts = line.split()
                if len(parts) < 6:
                    continue
                ip, _hw_type, flags, mac, _, device = parts[:6]
                if mac == "00:00:00:00:00:00" or flags == "0x0":
                    continue  # incomplete
                entries.append({
                    "ip": ip,
                    "mac": mac.upper(),
                    "interface": device,
                })
    except OSError as exc:
        logger.warning("Cannot read ARP table (%s): %s", path, exc)
    return entries


# ---------------------------------------------------------------------------
# Routing / gateways
# ---------------------------------------------------------------------------

def _hex_to_ip(hex_str: str) -> str:
    """Convert a little-endian hex IP from /proc/net/route to dotted-quad."""
    b = bytes.fromhex(hex_str)
    return ".".join(str(x) for x in reversed(b))


def read_gateways() -> list[dict]:
    """Return default gateways parsed from /proc/net/route."""
    path = _find_proc("route")
    gateways: list[dict] = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh.readlines()[1:]:
                parts = line.split()
                if len(parts) < 8:
                    continue
                iface, dest, gw = parts[0], parts[1], parts[2]
                if dest == "00000000" and gw != "00000000":
                    gateways.append({"ip": _hex_to_ip(gw), "interface": iface})
    except OSError as exc:
        logger.warning("Cannot read route table (%s): %s", path, exc)
    return gateways


def get_scan_subnets() -> list[dict]:
    """Determine which local subnets are eligible for scanning."""
    path = _find_proc("route")
    gw_map = {g["interface"]: g["ip"] for g in read_gateways()}
    subnets: list[dict] = []
    seen: set[str] = set()

    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh.readlines()[1:]:
                parts = line.split()
                if len(parts) < 8:
                    continue
                iface, dest, _, flags_s, _, _, _, mask = parts[:8]
                flags = int(flags_s, 16)
                if dest == "00000000" or not (flags & 0x1):
                    continue
                dest_ip = _hex_to_ip(dest)
                mask_ip = _hex_to_ip(mask)
                try:
                    network = ipaddress.IPv4Network(f"{dest_ip}/{mask_ip}", strict=False)
                except ValueError:
                    continue
                if network.prefixlen < _MAX_SUBNET_PREFIX:
                    continue  # too large
                key = str(network)
                if key in seen:
                    continue
                seen.add(key)
                subnets.append({
                    "network": key,
                    "interface": iface,
                    "gateway": gw_map.get(iface),
                })
    except OSError as exc:
        logger.warning("Cannot read route table for subnets (%s): %s", path, exc)

    return subnets


# ---------------------------------------------------------------------------
# Ping sweep
# ---------------------------------------------------------------------------

def _use_nsenter() -> bool:
    global _nsenter_cache  # noqa: PLW0603
    if _nsenter_cache is None:
        _nsenter_cache = shutil.which("nsenter") is not None and os.path.exists("/proc/1")
    return _nsenter_cache


async def _ping_one(
    ip: str,
    semaphore: asyncio.Semaphore,
    results: dict[str, float],
) -> None:
    async with semaphore:
        try:
            cmd: list[str] = []
            if _use_nsenter():
                cmd = ["nsenter", "-t", "1", "-n", "--"]
            cmd.extend(["ping", "-c", "1", "-W", _PING_TIMEOUT_S, ip])

            start = time.monotonic()
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=float(_PING_TIMEOUT_S) + 1.0)
            elapsed_ms = round((time.monotonic() - start) * 1000, 1)

            if proc.returncode == 0:
                results[ip] = elapsed_ms
        except asyncio.TimeoutError:
            try:
                proc.terminate()  # type: ignore[possibly-undefined]
            except (ProcessLookupError, OSError):
                pass
        except (OSError, subprocess.SubprocessError):
            pass  # host unreachable — expected


async def ping_sweep(subnets: list[dict]) -> dict[str, float]:
    """Ping all hosts in the given subnets. Returns {ip: latency_ms}."""
    semaphore = asyncio.Semaphore(_SWEEP_SEMAPHORE)
    results: dict[str, float] = {}
    tasks: list[asyncio.Task] = []

    for subnet_info in subnets:
        try:
            network = ipaddress.IPv4Network(subnet_info["network"], strict=False)
        except ValueError:
            continue
        for host in network.hosts():
            ip = str(host)
            tasks.append(asyncio.create_task(_ping_one(ip, semaphore, results)))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    return results


# ---------------------------------------------------------------------------
# Build full network map
# ---------------------------------------------------------------------------

def _build_device_list(
    arp_entries: list[dict],
    gateway_ips: set[str],
    latency_map: dict[str, float],
) -> list[dict]:
    """Merge ARP data with OUI and gateway info into the final device list."""
    seen: set[str] = set()
    devices: list[dict] = []

    for entry in arp_entries:
        ip = entry["ip"]
        if ip in seen:
            continue
        seen.add(ip)
        mac = entry["mac"]
        devices.append({
            "ip": ip,
            "mac": mac,
            "vendor": lookup_vendor(mac),
            "type": "router" if ip in gateway_ips else "host",
            "interface": entry["interface"],
            "latency_ms": latency_map.get(ip),
        })

    # Sort: routers first, then by IP
    def sort_key(d: dict) -> tuple:
        type_order = 0 if d["type"] == "router" else 1
        try:
            ip_obj = ipaddress.IPv4Address(d["ip"])
        except ValueError:
            ip_obj = ipaddress.IPv4Address("255.255.255.255")
        return (type_order, ip_obj)

    devices.sort(key=sort_key)
    return devices


async def build_network_map(active_scan: bool = False) -> dict:
    """Orchestrate full network discovery.

    Args:
        active_scan: If True, run a ping sweep before reading ARP.
                     If False, return only cached ARP data (passive).
    """
    t0 = time.monotonic()
    subnets = get_scan_subnets()
    gateways = read_gateways()
    gateway_ips = {gw["ip"] for gw in gateways}
    latency_map: dict[str, float] = {}
    hosts_scanned = 0

    if active_scan and subnets:
        for s in subnets:
            try:
                net = ipaddress.IPv4Network(s["network"], strict=False)
                hosts_scanned += net.num_addresses - 2
            except ValueError:
                pass
        latency_map = await ping_sweep(subnets)

    arp_entries = read_arp_table()
    devices = _build_device_list(arp_entries, gateway_ips, latency_map)
    duration_ms = round((time.monotonic() - t0) * 1000, 1)

    return {
        "devices": devices,
        "subnets": subnets,
        "scan_info": {
            "method": "ping_sweep" if active_scan else "passive",
            "duration_ms": duration_ms,
            "hosts_scanned": hosts_scanned,
            "hosts_found": len(devices),
            "timestamp": time.time(),
        },
    }
