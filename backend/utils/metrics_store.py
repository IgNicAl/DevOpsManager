import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Optional

import psutil

logger = logging.getLogger(__name__)

GLOBAL_MAXLEN = 12  # 60 s @ 5 s sampling
PID_TTL_SECONDS = 60


@dataclass
class Sample:
    t: float
    v: float


class MetricsStore:
    def __init__(self) -> None:
        self.cpu: deque[Sample] = deque(maxlen=GLOBAL_MAXLEN)
        self.ram: deque[Sample] = deque(maxlen=GLOBAL_MAXLEN)
        self._pid_cpu: dict[int, deque[Sample]] = {}
        self._pid_mem: dict[int, deque[Sample]] = {}
        self._pid_last_seen: dict[int, float] = {}
        self._pid_handles: dict[int, psutil.Process] = {}
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        # Prime psutil so cpu_percent(None) returns useful numbers
        psutil.cpu_percent(interval=None)

    async def start(self) -> None:
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
                await self._sample()
            except Exception:
                logger.exception("metrics_store sample failed")
            await asyncio.sleep(5)

    async def _sample(self) -> None:
        now = time.time()
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory().percent
        async with self._lock:
            self.cpu.append(Sample(t=now, v=cpu))
            self.ram.append(Sample(t=now, v=mem))
            self._evict_stale(now)
            await self._sample_pids(now)

    def _evict_stale(self, now: float) -> None:
        stale = [pid for pid, t in self._pid_last_seen.items() if now - t > PID_TTL_SECONDS]
        for pid in stale:
            self._pid_cpu.pop(pid, None)
            self._pid_mem.pop(pid, None)
            self._pid_last_seen.pop(pid, None)
            self._pid_handles.pop(pid, None)

    async def _sample_pids(self, now: float) -> None:
        dead = []
        for pid, proc in list(self._pid_handles.items()):
            try:
                cpu = proc.cpu_percent(interval=None)
                mem = proc.memory_percent()
                self._pid_cpu[pid].append(Sample(t=now, v=cpu))
                self._pid_mem[pid].append(Sample(t=now, v=mem))
            except psutil.NoSuchProcess:
                dead.append(pid)
            except psutil.AccessDenied:
                dead.append(pid)
        for pid in dead:
            self._pid_cpu.pop(pid, None)
            self._pid_mem.pop(pid, None)
            self._pid_last_seen.pop(pid, None)
            self._pid_handles.pop(pid, None)

    def subscribe_pid(self, pid: int) -> bool:
        if pid in self._pid_handles:
            self._pid_last_seen[pid] = time.time()
            return True
        try:
            proc = psutil.Process(pid)
            proc.cpu_percent(interval=None)  # prime
            self._pid_handles[pid] = proc
            self._pid_cpu[pid] = deque(maxlen=GLOBAL_MAXLEN)
            self._pid_mem[pid] = deque(maxlen=GLOBAL_MAXLEN)
            self._pid_last_seen[pid] = time.time()
            return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False

    def get_global(self) -> dict:
        return {
            "cpu": [{"t": s.t, "v": s.v} for s in self.cpu],
            "ram": [{"t": s.t, "v": s.v} for s in self.ram],
        }

    def get_pid(self, pid: int) -> Optional[dict]:
        if pid not in self._pid_cpu:
            return None
        self._pid_last_seen[pid] = time.time()
        return {
            "pid": pid,
            "cpu": [{"t": s.t, "v": s.v} for s in self._pid_cpu[pid]],
            "memory": [{"t": s.t, "v": s.v} for s in self._pid_mem[pid]],
        }

    def high_load(self, threshold: float = 80.0, window: int = 6) -> bool:
        """True if last `window` CPU samples are all >= threshold (window*5s = duration)."""
        if len(self.cpu) < window:
            return False
        last = list(self.cpu)[-window:]
        return all(s.v >= threshold for s in last)


# Module-level singleton
metrics_store = MetricsStore()
