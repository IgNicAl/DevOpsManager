import platform
import time
from datetime import datetime

import psutil
from fastapi import APIRouter, Query

from models.envelope import ok, fail
from utils.metrics_store import metrics_store

router = APIRouter(prefix="/api/system", tags=["System"])


@router.get("/overview")
def system_overview():
    try:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        uname = platform.uname()

        return ok({
            "cpu_percent": cpu_percent,
            "ram_used_gb": round(mem.used / (1024 ** 3), 2),
            "ram_total_gb": round(mem.total / (1024 ** 3), 2),
            "ram_percent": mem.percent,
            "disk_used_gb": round(disk.used / (1024 ** 3), 2),
            "disk_total_gb": round(disk.total / (1024 ** 3), 2),
            "disk_percent": disk.percent,
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


@router.get("/disk")
def disk_partitions():
    try:
        partitions = psutil.disk_partitions(all=False)
        disks = []
        for p in partitions:
            try:
                usage = psutil.disk_usage(p.mountpoint)
                disks.append({
                    "device": p.device,
                    "mountpoint": p.mountpoint,
                    "fstype": p.fstype,
                    "total_gb": round(usage.total / (1024 ** 3), 2),
                    "used_gb": round(usage.used / (1024 ** 3), 2),
                    "free_gb": round(usage.free / (1024 ** 3), 2),
                    "percent": usage.percent,
                })
            except PermissionError:
                continue
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
