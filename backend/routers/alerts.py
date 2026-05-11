import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from models.envelope import ok, fail
from utils.alerts_engine import alerts_engine, ALLOWED_KINDS
from utils.sse import sse_event
from utils.validators import (
    validate_safe_path,
    validate_service_name,
)

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


def _validate_rule(rule: dict) -> Optional[str]:
    kind = rule.get("kind")
    if kind not in ALLOWED_KINDS:
        return f"Invalid kind '{kind}'"
    threshold = rule.get("threshold")
    if kind in ("cpu", "memory", "disk"):
        if not isinstance(threshold, (int, float)) or threshold < 0 or threshold > 100:
            return "threshold must be 0-100 for percent metrics"
    target = rule.get("target")
    if kind == "disk":
        if target is None or target == "":
            target = "/"
            rule["target"] = target
        if not validate_safe_path(target):
            return "Invalid disk target path"
    if kind == "service":
        if not target or not validate_service_name(target):
            return "Invalid service target"
    label = rule.get("label", "")
    if not isinstance(label, str) or len(label) > 128:
        return "Invalid label"
    return None


@router.get("/active")
def list_active():
    return ok(alerts_engine.active())


@router.get("/history")
def list_history(limit: int = Query(100, ge=1, le=500)):
    return ok(alerts_engine.history_tail(limit))


@router.get("/config")
def list_config():
    return ok(alerts_engine.all_rules())


class Rule(BaseModel):
    id: Optional[str] = Field(None, max_length=64)
    kind: str
    threshold: Optional[float] = None
    target: Optional[str] = Field(None, max_length=256)
    label: Optional[str] = ""


class ConfigBody(BaseModel):
    rules: list[Rule] = Field(default_factory=list, max_length=64)


@router.put("/config")
def replace_config(body: ConfigBody):
    rules_raw = [r.model_dump() for r in body.rules]
    for r in rules_raw:
        err = _validate_rule(r)
        if err:
            raise HTTPException(status_code=400, detail=fail(err))
    alerts_engine.replace_rules(rules_raw)
    return ok(alerts_engine.all_rules())


@router.post("/config")
def add_rule(rule: Rule):
    raw = rule.model_dump()
    err = _validate_rule(raw)
    if err:
        raise HTTPException(status_code=400, detail=fail(err))
    new = alerts_engine.add_rule(raw)
    return ok(new)


@router.delete("/config/{rule_id}")
def remove_rule(rule_id: str):
    if len(rule_id) > 64:
        raise HTTPException(status_code=400, detail=fail("Invalid rule id"))
    if not alerts_engine.remove_rule(rule_id):
        raise HTTPException(status_code=404, detail=fail("Rule not found"))
    return ok({"id": rule_id, "message": "Rule removed"})


@router.get("/stream")
async def stream_alerts(request: Request):
    queue = alerts_engine.subscribe()

    async def gen():
        try:
            yield sse_event("snapshot", {"active": alerts_engine.active()})
            while True:
                if await request.is_disconnected():
                    break
                try:
                    transition = await asyncio.wait_for(queue.get(), timeout=15)
                    yield sse_event("transition", transition)
                except asyncio.TimeoutError:
                    yield sse_event("ping", {"ts": asyncio.get_event_loop().time()})
        finally:
            alerts_engine.unsubscribe(queue)

    return EventSourceResponse(gen())
