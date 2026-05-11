import os
import platform
import time
from datetime import datetime

import psutil
from fastapi import APIRouter, Query

from models.envelope import ok, fail
from utils.metrics_store import metrics_store

HOST_ROOT = "/host/root"
HOST_PROC_MOUNTS = "/proc/1/mounts"

_SKIP_FS = {
    "tmpfs", "devtmpfs", "devpts", "sysfs", "proc", "cgroup", "cgroup2",
    "pstore", "bpf", "tracefs", "debugfs", "securityfs", "hugetlbfs",
    "mqueue", "fusectl", "overlay", "squashfs", "autofs", "efivarfs",
    "configfs", "ramfs", "rpc_pipefs", "nsfs",
}

router = APIRouter(prefix="/api/system", tags=["System"])


def _get_root_disk_stats() -> dict:
    """Read /proc/1/mounts to find the real root partition and return its stats."""
    best = None
    try:
        with open(HOST_PROC_MOUNTS) as f:
            for line in f:
                parts = line.split()
                if len(parts) < 3:
                    continue
                device, mountpoint, fstype = parts[0], parts[1], parts[2]
                if fstype in _SKIP_FS or not device.startswith("/dev/"):
                    continue
                host_path = f"{HOST_ROOT}{mountpoint}"
                try:
                    st = os.statvfs(host_path)
                    total = st.f_blocks * st.f_frsize
                    if total == 0:
                        continue
                    free = st.f_bavail * st.f_frsize
                    used = total - free
                    entry = {
                        "mountpoint": mountpoint,
                        "total": total,
                        "used": used,
                        "free": free,
                    }
                    # Prefer "/" mountpoint; otherwise pick the largest partition
                    if mountpoint == "/":
                        return entry
                    if best is None or total > best["total"]:
                        best = entry
                except OSError:
                    continue
    except OSError:
        pass
    if best:
        return best
    # Fallback: statvfs on HOST_ROOT (may be inaccurate inside containers)
    st = os.statvfs(HOST_ROOT)
    total = st.f_blocks * st.f_frsize
    free = st.f_bavail * st.f_frsize
    return {"mountpoint": "/", "total": total, "used": total - free, "free": free}


@router.get("/overview")
def system_overview():
    try:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        uname = platform.uname()

        disk = _get_root_disk_stats()
        disk_total = disk["total"]
        disk_used = disk["used"]

        return ok({
            "cpu_percent": cpu_percent,
            "ram_used_gb": round(mem.used / (1024 ** 3), 2),
            "ram_total_gb": round(mem.total / (1024 ** 3), 2),
            "ram_percent": mem.percent,
            "disk_used_gb": round(disk_used / (1024 ** 3), 2),
            "disk_total_gb": round(disk_total / (1024 ** 3), 2),
            "disk_percent": round(disk_used / disk_total * 100, 1) if disk_total else 0,
            "uptime_seconds": int(uptime_seconds),
            "hostname": uname.node,
            "os_name": f"{uname.system} {uname.release}",
            "kernel_version": uname.version,
        })
    except Exception as exc:
        return fail(str(exc))


@router.get("/cpu")
def cpu_details():
    try:
        per_core = psutil.cpu_percent(interval=0.5, percpu=True)
        load_1, load_5, load_15 = psutil.getloadavg()
        freq = psutil.cpu_freq()

        return ok({
            "per_core_percent": per_core,
            "core_count": psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False),
            "load_average": {"1m": load_1, "5m": load_5, "15m": load_15},
            "frequency_mhz": {
                "current": round(freq.current, 2) if freq else None,
                "min": round(freq.min, 2) if freq else None,
                "max": round(freq.max, 2) if freq else None,
            },
        })
    except Exception as exc:
        return fail(str(exc))


@router.get("/memory")
def memory_details():
    try:
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        return ok({
            "ram": {
                "total_gb": round(mem.total / (1024 ** 3), 2),
                "used_gb": round(mem.used / (1024 ** 3), 2),
                "free_gb": round(mem.available / (1024 ** 3), 2),
                "percent": mem.percent,
            },
            "swap": {
                "total_gb": round(swap.total / (1024 ** 3), 2),
                "used_gb": round(swap.used / (1024 ** 3), 2),
                "free_gb": round(swap.free / (1024 ** 3), 2),
                "percent": swap.percent,
            },
        })
    except Exception as exc:
        return fail(str(exc))


def _preferred_mountpoint(a: str, b: str) -> str:
    """Pick the more canonical mountpoint between two candidates."""
    priority = ["/", "/home", "/var", "/boot", "/boot/efi"]
    ai = priority.index(a) if a in priority else len(priority)
    bi = priority.index(b) if b in priority else len(priority)
    if ai != bi:
        return a if ai < bi else b
    return a if len(a) <= len(b) else b


def _short_device(device: str) -> str:
    """Shorten verbose mapper/LUKS device names for display."""
    name = device.rsplit("/", 1)[-1]
    if name.startswith("luks-"):
        return f"luks-{name[5:13]}…"
    return name


@router.get("/disk")
def disk_partitions():
    try:
        raw: dict[str, dict] = {}
        seen = set()

        with open(HOST_PROC_MOUNTS) as f:
            for line in f:
                parts = line.split()
                if len(parts) < 3:
                    continue
                device, mountpoint, fstype = parts[0], parts[1], parts[2]

                if fstype in _SKIP_FS or not device.startswith("/dev/"):
                    continue
                key = (device, mountpoint)
                if key in seen:
                    continue
                seen.add(key)

                host_path = f"{HOST_ROOT}{mountpoint}"
                try:
                    st = os.statvfs(host_path)
                    total = st.f_blocks * st.f_frsize
                    free = st.f_bavail * st.f_frsize
                    used = total - free
                    if total == 0:
                        continue

                    # Deduplicate: same device + same total = same physical disk
                    dedup_key = (device, total)
                    if dedup_key in raw:
                        old_mp = raw[dedup_key]["mountpoint"]
                        raw[dedup_key]["mountpoint"] = _preferred_mountpoint(old_mp, mountpoint)
                        continue

                    raw[dedup_key] = {
                        "device": device,
                        "device_short": _short_device(device),
                        "mountpoint": mountpoint,
                        "fstype": fstype,
                        "total_gb": round(total / (1024 ** 3), 2),
                        "used_gb": round(used / (1024 ** 3), 2),
                        "free_gb": round(free / (1024 ** 3), 2),
                        "percent": round(used / total * 100, 1),
                    }
                except OSError:
                    continue

        disks = sorted(raw.values(), key=lambda d: d["mountpoint"])
        return ok(disks)
    except Exception as exc:
        return fail(str(exc))


@router.get("/network")
def network_io():
    try:
        counters = psutil.net_io_counters(pernic=True)
        interfaces = []
        for name, stats in counters.items():
            interfaces.append({
                "interface": name,
                "bytes_sent": stats.bytes_sent,
                "bytes_recv": stats.bytes_recv,
                "packets_sent": stats.packets_sent,
                "packets_recv": stats.packets_recv,
                "errors_in": stats.errin,
                "errors_out": stats.errout,
            })
        return ok(interfaces)
    except Exception as exc:
        return fail(str(exc))


@router.get("/history")
def system_history():
    return ok(metrics_store.get_global())


@router.get("/temperature")
def system_temperature():
    try:
        sensors = psutil.sensors_temperatures()
    except (AttributeError, NotImplementedError):
        return fail("temperature sensors not available")
    if not sensors:
        return fail("temperature sensors not available")
    grouped = {}
    for chip, entries in sensors.items():
        grouped[chip] = [
            {
                "label": e.label or chip,
                "current": e.current,
                "high": e.high,
                "critical": e.critical,
            }
            for e in entries
        ]
    return ok(grouped)


@router.get("/top-processes")
def top_processes(by: str = Query("cpu", pattern="^(cpu|memory)$"), limit: int = Query(5, ge=1, le=50)):
    try:
        for proc in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent"]):
            try:
                proc.cpu_percent(interval=None)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        time.sleep(0.3)

        processes = []
        for proc in psutil.process_iter(["pid", "name", "username", "memory_percent"]):
            try:
                cpu = proc.cpu_percent(interval=None)
                info = proc.info
                info["cpu_percent"] = cpu
                processes.append(info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        key = "cpu_percent" if by == "cpu" else "memory_percent"
        processes.sort(key=lambda p: p.get(key) or 0.0, reverse=True)
        return ok(processes[:limit])
    except Exception as exc:
        return fail(str(exc))


@router.get("/load")
def system_load():
    return ok({
        "high_load": metrics_store.high_load(threshold=80.0, window=6),
        "samples_in_window": min(len(metrics_store.cpu), 6),
        "now": datetime.utcnow().isoformat() + "Z",
    })
