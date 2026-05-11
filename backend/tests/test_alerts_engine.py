import os
import tempfile

import pytest

from utils.alerts_engine import AlertsEngine


@pytest.fixture
def engine(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("BACKEND_DATA_DIR", tmp)
    eng = AlertsEngine()
    eng.load()
    yield eng


def test_add_rule_persists(engine, monkeypatch):
    rule = engine.add_rule({"kind": "cpu", "threshold": 80, "label": "test"})
    assert rule["id"]
    assert rule["state"] == "ok"

    # reload from disk
    other = AlertsEngine()
    other.load()
    assert any(r["id"] == rule["id"] for r in other.rules)


def test_replace_rules_preserves_state(engine):
    rule = engine.add_rule({"kind": "cpu", "threshold": 80})
    rule_id = rule["id"]
    # mark firing
    for r in engine.rules:
        if r["id"] == rule_id:
            r["state"] = "firing"
            r["since"] = 100.0
    engine.replace_rules([{"id": rule_id, "kind": "cpu", "threshold": 90}])
    found = next(r for r in engine.rules if r["id"] == rule_id)
    assert found["state"] == "firing"
    assert found["since"] == 100.0


def test_remove_rule(engine):
    rule = engine.add_rule({"kind": "memory", "threshold": 90})
    assert engine.remove_rule(rule["id"])
    assert not engine.remove_rule(rule["id"])  # already gone


@pytest.mark.asyncio
async def test_evaluate_cpu_under_threshold(engine):
    # threshold=100 -> never fires
    engine.add_rule({"kind": "cpu", "threshold": 100})
    await engine.evaluate()
    assert engine.active() == []


@pytest.mark.asyncio
async def test_evaluate_cpu_always_fires(engine):
    engine.add_rule({"kind": "cpu", "threshold": 0})
    await engine.evaluate()
    active = engine.active()
    assert len(active) == 1
    assert active[0]["kind"] == "cpu"
    # history should have a transition
    hist = engine.history_tail(10)
    assert any(h["transition"].endswith("firing") for h in hist)


@pytest.mark.asyncio
async def test_evaluate_transitions_recorded_only_once(engine):
    engine.add_rule({"kind": "cpu", "threshold": 0})
    await engine.evaluate()
    await engine.evaluate()  # still firing — no new transition
    hist = engine.history_tail(10)
    transitions = [h for h in hist if h["transition"].endswith("firing")]
    assert len(transitions) == 1


def test_active_returns_only_firing(engine):
    engine.add_rule({"kind": "cpu", "threshold": 80})
    engine.rules[0]["state"] = "firing"
    assert len(engine.active()) == 1
