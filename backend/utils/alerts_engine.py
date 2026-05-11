import asyncio
import json
import logging
import time
import uuid
from collections import deque
from typing import Optional

import psutil

from utils.data_dir import data_path
from utils.subprocess_runner import run_cmd

logger = logging.getLogger(__name__)

CONFIG_FILENAME = "alerts-config.json"
HISTORY_FILENAME = "alerts-history.jsonl"
HISTORY_MAXLEN = 500
EVAL_INTERVAL_SEC = 10

ALLOWED_KINDS = {"cpu", "memory", "disk", "service"}


class AlertsEngine:
    def __init__(self) -> None:
        self.rules: list[dict] = []
        self.history: deque[dict] = deque(maxlen=HISTORY_MAXLEN)
        self._task: Optional[asyncio.Task] = None
        self._subscribers: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()
        self._loaded = False

    def _config_path(self):
        return data_path(CONFIG_FILENAME)

    def _history_path(self):
        return data_path(HISTORY_FILENAME)

    def load(self) -> None:
        cfg = self._config_path()
        if cfg.exists():
            try:
                self.rules = json.loads(cfg.read_text() or "[]")
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("alerts-config.json unreadable: %s", exc)
                self.rules = []
        else:
            self.rules = []
        for r in self.rules:
            r.setdefault("state", "ok")
            r.setdefault("since", None)

        hist = self._history_path()
        if hist.exists():
            try:
                lines = hist.read_text().splitlines()
                for line in lines[-HISTORY_MAXLEN:]:
                    if line.strip():
                        try:
                            self.history.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
            except OSError:
                pass
        self._loaded = True

    def save_config(self) -> None:
        cfg = self._config_path()
        tmp = cfg.with_suffix(".tmp")
        tmp.write_text(json.dumps([self._sanitize_rule(r) for r in self.rules], indent=2))
        tmp.replace(cfg)

    @staticmethod
    def _sanitize_rule(rule: dict) -> dict:
        return {
            "id": rule["id"],
            "kind": rule["kind"],
            "threshold": rule.get("threshold"),
            "target": rule.get("target"),
            "label": rule.get("label", ""),
            "state": rule.get("state", "ok"),
            "since": rule.get("since"),
        }

    def add_rule(self, rule: dict) -> dict:
        rule_id = rule.get("id") or uuid.uuid4().hex[:12]
        new_rule = {
            "id": rule_id,
            "kind": rule["kind"],
            "threshold": rule.get("threshold"),
            "target": rule.get("target"),
            "label": rule.get("label", ""),
            "state": "ok",
            "since": None,
        }
        self.rules = [r for r in self.rules if r["id"] != rule_id]
        self.rules.append(new_rule)
        self.save_config()
        return new_rule

    def replace_rules(self, rules: list[dict]) -> None:
        normalized = []
        for r in rules:
            normalized.append({
                "id": r.get("id") or uuid.uuid4().hex[:12],
                "kind": r["kind"],
                "threshold": r.get("threshold"),
                "target": r.get("target"),
                "label": r.get("label", ""),
                "state": "ok",
                "since": None,
            })
        # preserve current state for unchanged rule ids
        prev = {r["id"]: r for r in self.rules}
        for r in normalized:
            if r["id"] in prev:
                r["state"] = prev[r["id"]]["state"]
                r["since"] = prev[r["id"]]["since"]
        self.rules = normalized
        self.save_config()

    def remove_rule(self, rule_id: str) -> bool:
        before = len(self.rules)
        self.rules = [r for r in self.rules if r["id"] != rule_id]
        if len(self.rules) != before:
            self.save_config()
            return True
        return False

    async def start(self) -> None:
        if not self._loaded:
            self.load()
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while True:
            try:
                await self.evaluate()
            except Exception:
                logger.exception("alerts evaluation failed")
            await asyncio.sleep(EVAL_INTERVAL_SEC)

    async def evaluate(self) -> None:
        now = time.time()
        async with self._lock:
            for rule in self.rules:
                firing, value = self._check_rule(rule)
                prev_state = rule.get("state", "ok")
                new_state = "firing" if firing else "ok"
                if new_state != prev_state:
                    rule["state"] = new_state
                    rule["since"] = now
                    transition = {
                        "ts": now,
                        "rule_id": rule["id"],
                        "kind": rule["kind"],
                        "label": rule.get("label", ""),
                        "target": rule.get("target"),
                        "threshold": rule.get("threshold"),
                        "transition": f"{prev_state}->{new_state}",
                        "value": value,
                    }
                    self.history.append(transition)
                    self._append_history(transition)
                    self._broadcast(transition)
            self.save_config()

    def _check_rule(self, rule: dict) -> tuple[bool, Optional[float]]:
        kind = rule["kind"]
        threshold = rule.get("threshold")
        target = rule.get("target")
        try:
            if kind == "cpu":
                v = psutil.cpu_percent(interval=None)
                return (v >= threshold, v) if threshold is not None else (False, v)
            if kind == "memory":
                v = psutil.virtual_memory().percent
                return (v >= threshold, v) if threshold is not None else (False, v)
            if kind == "disk":
                path = target or "/"
                v = psutil.disk_usage(path).percent
                return (v >= threshold, v) if threshold is not None else (False, v)
            if kind == "service":
                if not target:
                    return False, None
                success, output = run_cmd(["systemctl", "is-active", target], timeout=5)
                # is-active returns "active" on success, "inactive"/"failed" on non-zero
                state = output.strip()
                return state not in ("active", "activating"), 1.0 if state not in ("active", "activating") else 0.0
        except Exception:
            return False, None
        return False, None

    def _append_history(self, transition: dict) -> None:
        try:
            with self._history_path().open("a") as f:
                f.write(json.dumps(transition) + "\n")
        except OSError:
            logger.exception("Failed to write alerts history")

    def _broadcast(self, transition: dict) -> None:
        for q in list(self._subscribers):
            try:
                q.put_nowait(transition)
            except asyncio.QueueFull:
                pass

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        if q in self._subscribers:
            self._subscribers.remove(q)

    def active(self) -> list[dict]:
        return [self._sanitize_rule(r) for r in self.rules if r.get("state") == "firing"]

    def all_rules(self) -> list[dict]:
        return [self._sanitize_rule(r) for r in self.rules]

    def history_tail(self, limit: int = 100) -> list[dict]:
        items = list(self.history)
        return items[-limit:]


alerts_engine = AlertsEngine()
