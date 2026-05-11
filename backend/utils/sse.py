import json
from typing import Any


def sse_event(event: str, data: Any) -> dict:
    """Format an event payload for sse-starlette EventSourceResponse."""
    if isinstance(data, (dict, list)):
        payload = json.dumps(data)
    else:
        payload = str(data)
    return {"event": event, "data": payload}


def sse_ok(data: Any, event: str = "message") -> dict:
    return sse_event(event, {"success": True, "data": data, "error": None})


def sse_error(error: str, event: str = "error") -> dict:
    return sse_event(event, {"success": False, "data": None, "error": error})
