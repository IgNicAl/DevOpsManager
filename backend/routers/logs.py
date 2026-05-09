import os

from fastapi import APIRouter, HTTPException, Query

from models.envelope import ok, fail
from utils.validators import validate_service_name, validate_k8s_name, validate_docker_id
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/logs", tags=["Logs"])

SYSLOG_PATH = "/var/log/syslog"


def _filter_lines(lines: list[str], keyword: str | None) -> list[str]:
    """Filter log lines by keyword (case-insensitive)."""
    if not keyword:
        return lines
    keyword_lower = keyword.lower()
    return [line for line in lines if keyword_lower in line.lower()]


@router.get("/system")
def system_logs(lines: int = Query(100, ge=1, le=10000), filter: str | None = None):
    if not os.path.exists(SYSLOG_PATH):
        return fail(f"{SYSLOG_PATH} not found")

    try:
        with open(SYSLOG_PATH, "r", errors="replace") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:]
        filtered = _filter_lines(tail, filter)
        return ok({"lines": [l.rstrip() for l in filtered], "total": len(filtered)})
    except PermissionError:
        return fail(f"Permission denied reading {SYSLOG_PATH}")
    except Exception as exc:
        return fail(str(exc))


@router.get("/service/{name}")
def service_logs(
    name: str,
    lines: int = Query(100, ge=1, le=10000),
    filter: str | None = None,
):
    if not validate_service_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid service name"))

    success, output = run_cmd(["journalctl", "-u", name, "-n", str(lines), "--no-pager"])
    if not success:
        return fail(output)

    log_lines = output.splitlines()
    filtered = _filter_lines(log_lines, filter)
    return ok({"lines": filtered, "total": len(filtered)})


@router.get("/docker/{container_id}")
def docker_container_logs(
    container_id: str,
    lines: int = Query(100, ge=1, le=10000),
    filter: str | None = None,
):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))

    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(container_id)
        log_output = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        log_lines = log_output.splitlines()
        filtered = _filter_lines(log_lines, filter)
        return ok({"lines": filtered, "total": len(filtered)})
    except Exception as exc:
        return fail(f"Docker logs error: {exc}")


@router.get("/kubernetes/{namespace}/{pod}")
def kubernetes_pod_logs(
    namespace: str,
    pod: str,
    lines: int = Query(100, ge=1, le=10000),
    container: str | None = None,
    filter: str | None = None,
):
    if not validate_k8s_name(namespace):
        raise HTTPException(status_code=400, detail=fail("Invalid namespace name"))
    if not validate_k8s_name(pod):
        raise HTTPException(status_code=400, detail=fail("Invalid pod name"))
    if container and not validate_k8s_name(container):
        raise HTTPException(status_code=400, detail=fail("Invalid container name"))

    cmd = ["kubectl", "logs", pod, "-n", namespace, f"--tail={lines}"]
    if container:
        cmd.extend(["-c", container])

    success, output = run_cmd(cmd)
    if not success:
        return fail(output)

    log_lines = output.splitlines()
    filtered = _filter_lines(log_lines, filter)
    return ok({"lines": filtered, "total": len(filtered)})
