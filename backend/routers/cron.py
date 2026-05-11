import shutil
import subprocess
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from models.envelope import ok, fail
from utils.validators import (
    validate_cron_command,
    validate_cron_field,
    validate_cron_user,
    validate_username,
)

router = APIRouter(prefix="/api/cron", tags=["Cron"])


def _crontab_read(user: Optional[str]) -> tuple[bool, str]:
    """Run `crontab -l` for the given user (None = current user)."""
    args = ["crontab", "-l"]
    if user:
        args.extend(["-u", user])
    try:
        res = subprocess.run(args, capture_output=True, text=True, timeout=10, shell=False)
        if res.returncode == 0:
            return True, res.stdout
        # No crontab for user is exit code 1 with that exact stderr — treat as empty.
        if "no crontab for" in (res.stderr or "").lower():
            return True, ""
        return False, res.stderr.strip() or f"crontab exited {res.returncode}"
    except FileNotFoundError:
        return False, "'crontab' not installed"
    except subprocess.TimeoutExpired:
        return False, "crontab timed out"


def _crontab_write(user: Optional[str], content: str) -> tuple[bool, str]:
    args = ["crontab"]
    if user:
        args.extend(["-u", user])
    args.append("-")
    try:
        res = subprocess.run(args, input=content, capture_output=True, text=True, timeout=10, shell=False)
        if res.returncode == 0:
            return True, "OK"
        return False, res.stderr.strip() or f"crontab exited {res.returncode}"
    except FileNotFoundError:
        return False, "'crontab' not installed"
    except subprocess.TimeoutExpired:
        return False, "crontab timed out"


def _next_runs(expr: str, n: int = 3) -> list[str]:
    try:
        from croniter import croniter
        it = croniter(expr, datetime.now())
        return [it.get_next(datetime).isoformat() for _ in range(n)]
    except Exception:
        return []


def _parse_crontab(text: str) -> list[dict]:
    entries = []
    for idx, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip("\n")
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" in stripped and not stripped[0].isdigit() and stripped[0] != "*":
            # env-var line — skip
            continue
        parts = stripped.split(None, 5)
        if len(parts) < 6:
            continue
        minute, hour, dom, month, dow, command = parts
        expr = " ".join([minute, hour, dom, month, dow])
        entries.append({
            "index": idx,
            "minute": minute,
            "hour": hour,
            "dom": dom,
            "month": month,
            "dow": dow,
            "command": command,
            "expression": expr,
            "next_runs": _next_runs(expr, 3),
        })
    return entries


def _resolve_user(user: str) -> Optional[str]:
    """Map 'current' (or empty) to None (no -u), 'root' / username -> validated."""
    if user in (None, "", "current"):
        return None
    if not validate_username(user):
        raise HTTPException(status_code=400, detail=fail("Invalid user"))
    return user


@router.get("")
def list_crontab(user: str = Query("current", max_length=32)):
    if not validate_cron_user(user):
        raise HTTPException(status_code=400, detail=fail("Invalid user"))
    target = _resolve_user(user)
    if not shutil.which("crontab"):
        return fail("'crontab' not installed")
    success, content = _crontab_read(target)
    if not success:
        return fail(content)
    return ok({"user": user, "entries": _parse_crontab(content), "raw": content})


class CronEntryBody(BaseModel):
    user: str = Field("current", max_length=32)
    minute: str = Field(..., max_length=64)
    hour: str = Field(..., max_length=64)
    dom: str = Field(..., max_length=64)
    month: str = Field(..., max_length=64)
    dow: str = Field(..., max_length=64)
    command: str = Field(..., max_length=4096)
    confirm: bool = False


def _validate_cron_fields(body: CronEntryBody) -> str:
    for label, val in [
        ("minute", body.minute),
        ("hour", body.hour),
        ("dom", body.dom),
        ("month", body.month),
        ("dow", body.dow),
    ]:
        if not validate_cron_field(val):
            raise HTTPException(status_code=400, detail=fail(f"Invalid cron field '{label}'"))
    if not validate_cron_command(body.command):
        raise HTTPException(status_code=400, detail=fail("Invalid cron command"))
    expr = f"{body.minute} {body.hour} {body.dom} {body.month} {body.dow}"
    try:
        from croniter import croniter
        if not croniter.is_valid(expr):
            raise HTTPException(status_code=400, detail=fail("Invalid cron expression"))
    except ImportError:
        raise HTTPException(status_code=500, detail=fail("croniter not installed"))
    return expr


@router.post("")
def add_cron(body: CronEntryBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_cron_user(body.user):
        raise HTTPException(status_code=400, detail=fail("Invalid user"))
    expr = _validate_cron_fields(body)
    target = _resolve_user(body.user)
    if not shutil.which("crontab"):
        return fail("'crontab' not installed")

    success, content = _crontab_read(target)
    if not success:
        return fail(content)
    new_line = f"{expr} {body.command}"
    new_content = (content.rstrip("\n") + ("\n" if content.strip() else "") + new_line + "\n") if content.strip() else (new_line + "\n")
    success, msg = _crontab_write(target, new_content)
    if not success:
        return fail(msg)
    return ok({"message": "Entry added", "expression": expr})


@router.put("/{index}")
def update_cron(index: int, body: CronEntryBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_cron_user(body.user):
        raise HTTPException(status_code=400, detail=fail("Invalid user"))
    expr = _validate_cron_fields(body)
    target = _resolve_user(body.user)
    if not shutil.which("crontab"):
        return fail("'crontab' not installed")

    success, content = _crontab_read(target)
    if not success:
        return fail(content)
    lines = content.splitlines()
    if index < 1 or index > len(lines):
        raise HTTPException(status_code=404, detail=fail("Entry index out of range"))
    lines[index - 1] = f"{expr} {body.command}"
    new_content = "\n".join(lines) + "\n"
    success, msg = _crontab_write(target, new_content)
    if not success:
        return fail(msg)
    return ok({"message": "Entry updated"})


class DeleteCronBody(BaseModel):
    user: str = "current"
    confirm: bool = False


@router.delete("/{index}")
def delete_cron(index: int, body: DeleteCronBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_cron_user(body.user):
        raise HTTPException(status_code=400, detail=fail("Invalid user"))
    target = _resolve_user(body.user)
    if not shutil.which("crontab"):
        return fail("'crontab' not installed")
    success, content = _crontab_read(target)
    if not success:
        return fail(content)
    lines = content.splitlines()
    if index < 1 or index > len(lines):
        raise HTTPException(status_code=404, detail=fail("Entry index out of range"))
    del lines[index - 1]
    new_content = ("\n".join(lines) + "\n") if lines else ""
    success, msg = _crontab_write(target, new_content)
    if not success:
        return fail(msg)
    return ok({"message": "Entry removed"})


class ValidateCronBody(BaseModel):
    minute: str
    hour: str
    dom: str
    month: str
    dow: str


@router.post("/validate")
def validate_cron(body: ValidateCronBody):
    for label, val in [
        ("minute", body.minute),
        ("hour", body.hour),
        ("dom", body.dom),
        ("month", body.month),
        ("dow", body.dow),
    ]:
        if not validate_cron_field(val):
            return ok({"valid": False, "error": f"Invalid cron field '{label}'", "next_runs": []})
    expr = f"{body.minute} {body.hour} {body.dom} {body.month} {body.dow}"
    try:
        from croniter import croniter
        if not croniter.is_valid(expr):
            return ok({"valid": False, "error": "Invalid cron expression", "next_runs": []})
        return ok({"valid": True, "expression": expr, "next_runs": _next_runs(expr, 5)})
    except ImportError:
        return fail("croniter not installed")
