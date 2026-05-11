from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.envelope import ok, fail
from utils.validators import validate_service_name
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/services", tags=["Services"])

ALLOWED_ACTIONS = {"start", "stop", "restart", "enable", "disable"}


def _parse_systemd_timestamp(s: str) -> int:
    """Parse systemd timestamp string into epoch seconds (0 if invalid/empty)."""
    if not s or s in ("0", "n/a"):
        return 0
    # Examples: "Mon 2024-01-01 10:00:00 UTC" or "Mon 2024-01-01 10:00:00 BRT"
    parts = s.split(" ", 1)
    if len(parts) < 2:
        return 0
    try:
        # Drop weekday and trailing tz token; rely on local time fallback.
        body = parts[1].rsplit(" ", 1)[0]
        dt = datetime.strptime(body, "%Y-%m-%d %H:%M:%S")
        return int(dt.replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return 0


@router.get("")
def list_services(state: str = Query("all", pattern="^(all|running|failed|inactive)$")):
    success, output = run_cmd([
        "systemctl", "list-units", "--type=service", "--all", "--no-pager",
        "--plain", "--no-legend",
    ])
    if not success:
        return fail(output)

    services = []
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    for line in output.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        active_state = parts[2]
        sub_state = parts[3]
        if state == "running" and active_state != "active":
            continue
        if state == "failed" and active_state != "failed":
            continue
        if state == "inactive" and active_state not in ("inactive", "dead"):
            continue
        # uptime via show
        uptime_sec = 0
        if active_state == "active":
            ok2, out2 = run_cmd([
                "systemctl", "show", parts[0], "-p", "ActiveEnterTimestamp", "--value", "--no-pager"
            ], timeout=5)
            if ok2:
                started = _parse_systemd_timestamp(out2)
                if started:
                    uptime_sec = max(0, now_epoch - started)
        services.append({
            "name": parts[0],
            "load_state": parts[1],
            "active_state": active_state,
            "sub_state": sub_state,
            "description": parts[4] if len(parts) > 4 else "",
            "uptime_sec": uptime_sec,
        })
    return ok(services)


@router.get("/{name}")
def get_service(name: str):
    if not validate_service_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid service name"))

    success, output = run_cmd(["systemctl", "show", name, "--no-pager"])
    if not success:
        return fail(output)

    props = {}
    for line in output.splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            props[key] = value

    started_epoch = _parse_systemd_timestamp(props.get("ActiveEnterTimestamp", ""))
    uptime_sec = 0
    if started_epoch and props.get("ActiveState") == "active":
        uptime_sec = max(0, int(datetime.now(timezone.utc).timestamp()) - started_epoch)

    journal_tail: list[str] = []
    ok2, out2 = run_cmd(["journalctl", "-u", name, "-n", "20", "--no-pager"], timeout=10)
    if ok2 and out2:
        journal_tail = out2.splitlines()

    return ok({
        "name": name,
        "description": props.get("Description", ""),
        "load_state": props.get("LoadState", ""),
        "active_state": props.get("ActiveState", ""),
        "sub_state": props.get("SubState", ""),
        "main_pid": props.get("MainPID", ""),
        "memory_current": props.get("MemoryCurrent", ""),
        "active_enter_timestamp": props.get("ActiveEnterTimestamp", ""),
        "uptime_sec": uptime_sec,
        "journal_tail": journal_tail,
    })


class ServiceActionBody(BaseModel):
    service: str
    action: str
    confirm: bool = False


@router.post("/action")
def service_action(body: ServiceActionBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))

    if not validate_service_name(body.service):
        raise HTTPException(status_code=400, detail=fail("Invalid service name"))

    if body.action not in ALLOWED_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=fail(f"Invalid action: {body.action}. Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"),
        )

    success, output = run_cmd(["systemctl", body.action, body.service])
    if not success:
        return fail(output)

    return ok({"service": body.service, "action": body.action, "message": f"Service {body.service} {body.action} executed"})
