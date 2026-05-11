import signal
from datetime import datetime
from typing import Optional

import psutil
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.envelope import ok, fail
from utils.metrics_store import metrics_store

router = APIRouter(prefix="/api/processes", tags=["Processes"])

VALID_SORT_KEYS = {"cpu", "memory", "pid", "name"}


@router.get("")
def list_processes(
    search: Optional[str] = Query(None, max_length=128),
    sort: str = Query("cpu", pattern="^(cpu|memory|pid|name)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    try:
        processes = []
        for proc in psutil.process_iter(
            ["pid", "name", "username", "cpu_percent", "memory_percent", "status", "create_time", "cmdline"]
        ):
            try:
                info = proc.info
                info["create_time"] = (
                    datetime.fromtimestamp(info["create_time"]).isoformat() if info.get("create_time") else None
                )
                if search:
                    needle = search.lower()
                    name = (info.get("name") or "").lower()
                    cmd = " ".join(info.get("cmdline") or []).lower()
                    if needle not in name and needle not in cmd:
                        continue
                info.pop("cmdline", None)
                processes.append(info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        sort_key_map = {
            "cpu": lambda p: p.get("cpu_percent") or 0.0,
            "memory": lambda p: p.get("memory_percent") or 0.0,
            "pid": lambda p: p.get("pid") or 0,
            "name": lambda p: (p.get("name") or "").lower(),
        }
        processes.sort(key=sort_key_map[sort], reverse=(order == "desc"))
        return ok(processes)
    except Exception as exc:
        return fail(str(exc))


@router.get("/{pid}")
def get_process(pid: int):
    try:
        proc = psutil.Process(pid)
        info = proc.as_dict(attrs=[
            "pid", "name", "username", "cpu_percent", "memory_percent",
            "status", "create_time", "cmdline", "cwd",
        ])
        info["create_time"] = datetime.fromtimestamp(info["create_time"]).isoformat() if info.get("create_time") else None
        return ok(info)
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=fail(f"Process {pid} not found"))
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=fail(f"Access denied to process {pid}"))
    except Exception as exc:
        return fail(str(exc))


@router.get("/{pid}/history")
def get_process_history(pid: int):
    if not metrics_store.subscribe_pid(pid):
        raise HTTPException(status_code=404, detail=fail(f"Process {pid} not found or access denied"))
    history = metrics_store.get_pid(pid)
    if history is None:
        return ok({"pid": pid, "cpu": [], "memory": []})
    return ok(history)


class KillProcessBody(BaseModel):
    confirm: bool = False
    signal: str = "SIGTERM"


@router.delete("/{pid}")
def kill_process(pid: int, body: KillProcessBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))

    sig_map = {"SIGTERM": signal.SIGTERM, "SIGKILL": signal.SIGKILL}
    sig = sig_map.get(body.signal.upper())
    if sig is None:
        raise HTTPException(status_code=400, detail=fail(f"Invalid signal: {body.signal}. Use SIGTERM or SIGKILL"))

    try:
        proc = psutil.Process(pid)
        proc.send_signal(sig)
        return ok({"pid": pid, "signal_sent": body.signal.upper(), "message": f"Signal sent to process {pid}"})
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=fail(f"Process {pid} not found"))
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=fail(f"Access denied to process {pid}"))
    except Exception as exc:
        return fail(str(exc))
