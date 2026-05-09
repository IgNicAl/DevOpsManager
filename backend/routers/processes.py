import signal
from datetime import datetime

import psutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.envelope import ok, fail

router = APIRouter(prefix="/api/processes", tags=["Processes"])


@router.get("")
def list_processes():
    try:
        processes = []
        for proc in psutil.process_iter(
            ["pid", "name", "username", "cpu_percent", "memory_percent", "status", "create_time"]
        ):
            try:
                info = proc.info
                info["create_time"] = datetime.fromtimestamp(info["create_time"]).isoformat() if info.get("create_time") else None
                processes.append(info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
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
