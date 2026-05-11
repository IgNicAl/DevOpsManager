import json
import logging
import threading
import uuid
from typing import Optional

from utils.data_dir import data_path

logger = logging.getLogger(__name__)

FILENAME = "vlan-members.json"
_lock = threading.RLock()


def _path():
    return data_path(FILENAME)


def _load() -> list[dict]:
    p = _path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text() or "[]")
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("vlan-members.json unreadable: %s", exc)
        return []


def _save(items: list[dict]) -> None:
    p = _path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, indent=2))
    tmp.replace(p)


def list_all() -> list[dict]:
    with _lock:
        return _load()


def list_for_vlan(vlan: str) -> list[dict]:
    with _lock:
        return [m for m in _load() if m.get("vlan") == vlan]


def add(name: str, vlan: str, ip: Optional[str] = None, mac: Optional[str] = None, note: Optional[str] = None) -> dict:
    item = {
        "id": uuid.uuid4().hex[:12],
        "name": name,
        "vlan": vlan,
        "ip": ip or "",
        "mac": mac or "",
        "note": note or "",
    }
    with _lock:
        items = _load()
        items.append(item)
        _save(items)
    return item


def update(member_id: str, fields: dict) -> Optional[dict]:
    with _lock:
        items = _load()
        for m in items:
            if m["id"] == member_id:
                for k in ("name", "vlan", "ip", "mac", "note"):
                    if k in fields and fields[k] is not None:
                        m[k] = fields[k]
                _save(items)
                return m
    return None


def remove(member_id: str) -> bool:
    with _lock:
        items = _load()
        before = len(items)
        items = [m for m in items if m["id"] != member_id]
        if len(items) == before:
            return False
        _save(items)
        return True
