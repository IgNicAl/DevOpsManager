import asyncio
import fcntl
import json
import logging
import os
import pty
import shutil
import signal
import struct
import termios
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from models.envelope import ok, fail
from utils.data_dir import data_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/terminal", tags=["Terminal"])

AUDIT_FILENAME = "terminal-audit.jsonl"
TOKEN_ENV = "TERMINAL_TOKEN"
DEFAULT_COLS = 80
DEFAULT_ROWS = 24


def _audit_path():
    return data_path(AUDIT_FILENAME)


def _audit(event: dict) -> None:
    try:
        with _audit_path().open("a") as f:
            f.write(json.dumps(event) + "\n")
    except OSError:
        logger.exception("Failed to write terminal audit log")


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    try:
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        logger.exception("ioctl TIOCSWINSZ failed")


def _spawn_rbash() -> tuple[int, int]:
    """Fork + exec rbash with PTY. Returns (child_pid, master_fd)."""
    pid, fd = pty.fork()
    if pid == 0:
        # child: replace into rbash
        os.environ["PS1"] = "[restricted] \\u@\\h:\\w$ "
        os.environ["TERM"] = "xterm-256color"
        try:
            os.execvp("bash", ["bash", "--restricted", "-i"])
        except FileNotFoundError:
            os.write(2, b"bash not installed\n")
            os._exit(127)
    return pid, fd


@router.websocket("/ws")
async def terminal_ws(websocket: WebSocket, token: Optional[str] = Query(None)):
    expected = os.environ.get(TOKEN_ENV)
    if not expected:
        await websocket.close(code=1011, reason="terminal disabled (set TERMINAL_TOKEN)")
        return
    if not token or token != expected:
        await websocket.close(code=1008, reason="invalid token")
        return

    if not shutil.which("bash"):
        await websocket.close(code=1011, reason="bash not installed")
        return

    await websocket.accept()
    session_id = uuid.uuid4().hex[:12]
    _audit({"ts": time.time(), "session": session_id, "event": "open"})

    try:
        child_pid, master_fd = _spawn_rbash()
    except Exception as exc:
        logger.exception("Failed to spawn rbash")
        await websocket.send_text(json.dumps({"type": "error", "error": str(exc)}))
        await websocket.close()
        return

    _set_winsize(master_fd, DEFAULT_ROWS, DEFAULT_COLS)

    loop = asyncio.get_running_loop()
    bytes_in = bytes_out = 0

    async def reader_pty():
        nonlocal bytes_out
        while True:
            try:
                data = await loop.run_in_executor(None, lambda: os.read(master_fd, 4096))
            except OSError:
                break
            if not data:
                break
            bytes_out += len(data)
            try:
                await websocket.send_text(data.decode("utf-8", errors="replace"))
            except (RuntimeError, WebSocketDisconnect):
                break

    async def reader_ws():
        nonlocal bytes_in
        while True:
            try:
                msg = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            # Try control frame as JSON, else treat as keystrokes
            handled = False
            if msg and msg[0] == "{":
                try:
                    payload = json.loads(msg)
                    if isinstance(payload, dict) and payload.get("type") == "resize":
                        cols = int(payload.get("cols", DEFAULT_COLS))
                        rows = int(payload.get("rows", DEFAULT_ROWS))
                        _set_winsize(master_fd, rows, cols)
                        handled = True
                except (ValueError, TypeError):
                    pass
            if not handled:
                data = msg.encode("utf-8")
                bytes_in += len(data)
                try:
                    os.write(master_fd, data)
                except OSError:
                    break

    try:
        await asyncio.gather(reader_pty(), reader_ws(), return_exceptions=True)
    finally:
        try:
            os.kill(child_pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            os.close(master_fd)
        except OSError:
            pass
        _audit({
            "ts": time.time(),
            "session": session_id,
            "event": "close",
            "bytes_in": bytes_in,
            "bytes_out": bytes_out,
        })
        try:
            await websocket.close()
        except RuntimeError:
            pass


@router.get("/history")
def terminal_history(limit: int = Query(100, ge=1, le=1000)):
    path = _audit_path()
    if not path.exists():
        return ok([])
    try:
        lines = path.read_text().splitlines()
    except OSError as exc:
        return fail(str(exc))
    items = []
    for line in lines[-limit:]:
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return ok(items)


@router.get("/status")
def terminal_status():
    return ok({
        "available": bool(os.environ.get(TOKEN_ENV)) and bool(shutil.which("bash")),
        "token_required": True,
    })
