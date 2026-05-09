from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.envelope import ok, fail
from utils.validators import validate_service_name
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/services", tags=["Services"])

ALLOWED_ACTIONS = {"start", "stop", "restart", "enable", "disable"}


@router.get("")
def list_services():
    success, output = run_cmd([
        "systemctl", "list-units", "--type=service", "--all", "--no-pager",
        "--plain", "--no-legend",
    ])
    if not success:
        return fail(output)

    services = []
    for line in output.splitlines():
        parts = line.split(None, 4)
        if len(parts) >= 4:
            services.append({
                "name": parts[0],
                "load_state": parts[1],
                "active_state": parts[2],
                "status": parts[2],
                "sub_state": parts[3],
                "description": parts[4] if len(parts) > 4 else "",
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

    return ok({
        "name": name,
        "description": props.get("Description", ""),
        "load_state": props.get("LoadState", ""),
        "active_state": props.get("ActiveState", ""),
        "sub_state": props.get("SubState", ""),
        "main_pid": props.get("MainPID", ""),
        "memory_current": props.get("MemoryCurrent", ""),
        "active_enter_timestamp": props.get("ActiveEnterTimestamp", ""),
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
