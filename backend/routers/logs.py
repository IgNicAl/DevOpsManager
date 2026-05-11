import asyncio
import os
import re
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from models.envelope import ok, fail
from utils.sse import sse_event
from utils.validators import validate_service_name, validate_k8s_name, validate_docker_id
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/logs", tags=["Logs"])

SYSLOG_PATH = "/var/log/syslog"

LEVEL_PATTERNS = {
    "ERROR": re.compile(r"\b(error|err|critical|crit|fatal|alert|emerg)\b", re.IGNORECASE),
    "WARN": re.compile(r"\b(warn|warning|notice)\b", re.IGNORECASE),
    "INFO": re.compile(r"\b(info|debug|trace)\b", re.IGNORECASE),
}


def _filter_lines(lines: list[str], keyword: Optional[str], level: Optional[str]) -> list[str]:
    out = lines
    if keyword:
        kl = keyword.lower()
        out = [l for l in out if kl in l.lower()]
    if level and level.upper() in LEVEL_PATTERNS:
        pat = LEVEL_PATTERNS[level.upper()]
        out = [l for l in out if pat.search(l)]
    return out


def _validate_level(level: Optional[str]) -> bool:
    return level is None or level.upper() in {"ERROR", "WARN", "INFO", "ALL"}


@router.get("/system")
def system_logs(
    lines: int = Query(100, ge=1, le=10000),
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))

    if not os.path.exists(SYSLOG_PATH):
        return fail(f"{SYSLOG_PATH} not found")
    try:
        with open(SYSLOG_PATH, "r", errors="replace") as f:
            all_lines = f.readlines()
        tail = [l.rstrip() for l in all_lines[-lines:]]
        filtered = _filter_lines(tail, filter, level if level and level.upper() != "ALL" else None)
        return ok({"lines": filtered, "total": len(filtered)})
    except PermissionError:
        return fail(f"Permission denied reading {SYSLOG_PATH}")
    except Exception as exc:
        return fail(str(exc))


@router.get("/service/{name}")
def service_logs(
    name: str,
    lines: int = Query(100, ge=1, le=10000),
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not validate_service_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid service name"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))

    success, output = run_cmd(["journalctl", "-u", name, "-n", str(lines), "--no-pager"])
    if not success:
        return fail(output)

    log_lines = output.splitlines()
    filtered = _filter_lines(log_lines, filter, level if level and level.upper() != "ALL" else None)
    return ok({"lines": filtered, "total": len(filtered)})


@router.get("/docker/{container_id}")
def docker_container_logs(
    container_id: str,
    lines: int = Query(100, ge=1, le=10000),
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))

    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(container_id)
        log_output = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        log_lines = log_output.splitlines()
        filtered = _filter_lines(log_lines, filter, level if level and level.upper() != "ALL" else None)
        return ok({"lines": filtered, "total": len(filtered)})
    except Exception as exc:
        return fail(f"Docker logs error: {exc}")


@router.get("/kubernetes/{namespace}/{pod}")
def kubernetes_pod_logs(
    namespace: str,
    pod: str,
    lines: int = Query(100, ge=1, le=10000),
    container: Optional[str] = None,
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not validate_k8s_name(namespace):
        raise HTTPException(status_code=400, detail=fail("Invalid namespace name"))
    if not validate_k8s_name(pod):
        raise HTTPException(status_code=400, detail=fail("Invalid pod name"))
    if container and not validate_k8s_name(container):
        raise HTTPException(status_code=400, detail=fail("Invalid container name"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))

    cmd = ["kubectl", "logs", pod, "-n", namespace, f"--tail={lines}"]
    if container:
        cmd.extend(["-c", container])

    success, output = run_cmd(cmd)
    if not success:
        return fail(output)

    log_lines = output.splitlines()
    filtered = _filter_lines(log_lines, filter, level if level and level.upper() != "ALL" else None)
    return ok({"lines": filtered, "total": len(filtered)})


# ---------- Streaming (SSE) ----------

async def _stream_subprocess(args: list[str], request: Request, level: Optional[str]):
    """Stream stdout lines from a subprocess as SSE events. Cleans up on disconnect."""
    pat = LEVEL_PATTERNS.get(level.upper()) if level and level.upper() in LEVEL_PATTERNS else None
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
                await asyncio.sleep(0.1)
                continue
            text = line.decode("utf-8", errors="replace").rstrip()
            if pat and not pat.search(text):
                continue
            yield sse_event("log", {"line": text, "ts": time.time()})
    finally:
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=3)
        except (ProcessLookupError, asyncio.TimeoutError):
            try:
                proc.kill()
            except ProcessLookupError:
                pass


@router.get("/system/stream")
async def stream_system_logs(request: Request, level: Optional[str] = None):
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))
    return EventSourceResponse(_stream_subprocess(["journalctl", "-f", "-n", "0", "--no-pager"], request, level))


@router.get("/service/{name}/stream")
async def stream_service_logs(name: str, request: Request, level: Optional[str] = None):
    if not validate_service_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid service name"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))
    return EventSourceResponse(
        _stream_subprocess(["journalctl", "-fu", name, "-n", "0", "--no-pager"], request, level)
    )


@router.get("/docker/{container_id}/stream")
async def stream_docker_logs(container_id: str, request: Request, level: Optional[str] = None):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))

    pat = LEVEL_PATTERNS.get(level.upper()) if level and level.upper() in LEVEL_PATTERNS else None

    async def gen():
        try:
            import docker
            client = docker.from_env()
            container = client.containers.get(container_id)
            loop = asyncio.get_running_loop()
            stream = await loop.run_in_executor(
                None, lambda: container.logs(stream=True, follow=True, tail=0, timestamps=True)
            )
            for chunk in stream:
                if await request.is_disconnected():
                    break
                text = chunk.decode("utf-8", errors="replace").rstrip()
                if pat and not pat.search(text):
                    continue
                yield sse_event("log", {"line": text, "ts": time.time()})
        except Exception as exc:
            yield sse_event("error", {"error": str(exc)})

    return EventSourceResponse(gen())


# ---------- Export ----------

def _export_response(text: str, filename: str) -> StreamingResponse:
    def gen():
        yield text
    return StreamingResponse(
        gen(),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/system/export")
def export_system_logs(
    lines: int = Query(1000, ge=1, le=100000),
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))
    if not os.path.exists(SYSLOG_PATH):
        raise HTTPException(status_code=404, detail=fail(f"{SYSLOG_PATH} not found"))
    try:
        with open(SYSLOG_PATH, "r", errors="replace") as f:
            all_lines = f.readlines()
        tail = [l.rstrip() for l in all_lines[-lines:]]
        filtered = _filter_lines(tail, filter, level if level and level.upper() != "ALL" else None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=fail(str(exc)))
    fname = f"logs-system-{int(time.time())}.txt"
    return _export_response("\n".join(filtered) + "\n", fname)


@router.get("/service/{name}/export")
def export_service_logs(
    name: str,
    lines: int = Query(1000, ge=1, le=100000),
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not validate_service_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid service name"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))
    success, output = run_cmd(["journalctl", "-u", name, "-n", str(lines), "--no-pager"])
    if not success:
        raise HTTPException(status_code=500, detail=fail(output))
    log_lines = output.splitlines()
    filtered = _filter_lines(log_lines, filter, level if level and level.upper() != "ALL" else None)
    fname = f"logs-{name}-{int(time.time())}.txt"
    return _export_response("\n".join(filtered) + "\n", fname)


@router.get("/docker/{container_id}/export")
def export_docker_logs(
    container_id: str,
    lines: int = Query(1000, ge=1, le=100000),
    filter: Optional[str] = None,
    level: Optional[str] = Query(None, max_length=8),
):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    if not _validate_level(level):
        raise HTTPException(status_code=400, detail=fail("Invalid level"))
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(container_id)
        log_output = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        log_lines = log_output.splitlines()
        filtered = _filter_lines(log_lines, filter, level if level and level.upper() != "ALL" else None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=fail(str(exc)))
    fname = f"logs-{container_id}-{int(time.time())}.txt"
    return _export_response("\n".join(filtered) + "\n", fname)
