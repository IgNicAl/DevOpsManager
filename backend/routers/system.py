import platform
import time

import psutil
from fastapi import APIRouter

from models.envelope import ok, fail

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
