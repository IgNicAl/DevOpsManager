import os
import time

import pytest

from utils.metrics_store import MetricsStore, GLOBAL_MAXLEN, Sample


@pytest.mark.asyncio
async def test_sample_appends_global():
    store = MetricsStore()
    await store._sample()
    assert len(store.cpu) >= 1
    assert len(store.ram) >= 1


@pytest.mark.asyncio
async def test_subscribe_self_pid():
    store = MetricsStore()
    pid = os.getpid()
    assert store.subscribe_pid(pid)
    # sampling should populate history
    await store._sample()
    history = store.get_pid(pid)
    assert history is not None
    assert history["pid"] == pid


def test_subscribe_invalid_pid():
    store = MetricsStore()
    assert not store.subscribe_pid(99999999)  # nonexistent
    assert store.get_pid(99999999) is None


def test_high_load_requires_window():
    store = MetricsStore()
    # not enough samples
    assert store.high_load(threshold=10.0, window=6) is False


def test_high_load_returns_true_when_window_exceeds_threshold():
    store = MetricsStore()
    for _ in range(6):
        store.cpu.append(Sample(t=time.time(), v=95.0))
    assert store.high_load(threshold=80.0, window=6) is True


def test_high_load_returns_false_when_any_below():
    store = MetricsStore()
    for _ in range(5):
        store.cpu.append(Sample(t=time.time(), v=95.0))
    store.cpu.append(Sample(t=time.time(), v=10.0))
    assert store.high_load(threshold=80.0, window=6) is False


def test_get_global_returns_serializable():
    store = MetricsStore()
    store.cpu.append(Sample(t=1.0, v=50.0))
    g = store.get_global()
    assert "cpu" in g and "ram" in g
    assert g["cpu"][0]["v"] == 50.0


def test_global_maxlen():
    store = MetricsStore()
    for i in range(50):
        store.cpu.append(Sample(t=float(i), v=float(i)))
    assert len(store.cpu) == GLOBAL_MAXLEN
