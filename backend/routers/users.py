import shutil
from typing import Optional

from fastapi import APIRouter, Query

from models.envelope import ok, fail
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("")
def list_users():
    try:
        import grp
        import pwd
    except ImportError:
        return fail("System user database not available")

    try:
        users = []
        all_groups = grp.getgrall()
        gid_to_name = {g.gr_gid: g.gr_name for g in all_groups}
        user_to_groups: dict[str, list[str]] = {}
        for g in all_groups:
            for member in g.gr_mem:
                user_to_groups.setdefault(member, []).append(g.gr_name)

        for entry in pwd.getpwall():
            if entry.pw_uid < 1000 or entry.pw_name == "nobody":
                continue
            primary = gid_to_name.get(entry.pw_gid, str(entry.pw_gid))
            groups = sorted(set(user_to_groups.get(entry.pw_name, []) + [primary]))
            users.append({
                "username": entry.pw_name,
                "uid": entry.pw_uid,
                "gid": entry.pw_gid,
                "primary_group": primary,
                "gecos": entry.pw_gecos,
                "home": entry.pw_dir,
                "shell": entry.pw_shell,
                "groups": groups,
            })
        users.sort(key=lambda u: u["uid"])
        return ok(users)
    except Exception as exc:
        return fail(str(exc))


@router.get("/last-logins")
def last_logins(limit: int = Query(20, ge=1, le=200)):
    if not shutil.which("last"):
        return fail("'last' tool not installed")
    success, output = run_cmd(["last", "-n", str(limit), "-F"], timeout=10)
    if not success:
        return fail(output)
    rows = []
    for line in output.splitlines():
        if not line or line.startswith("wtmp begins"):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        rows.append({
            "username": parts[0],
            "tty": parts[1],
            "host": parts[2] if len(parts) > 2 else "",
            "raw": line,
        })
    return ok(rows[:limit])


@router.get("/sessions")
def list_sessions():
    if not shutil.which("who"):
        return fail("'who' tool not installed")
    success, output = run_cmd(["who", "-H"], timeout=5)
    if not success:
        return fail(output)
    sessions = []
    lines = output.splitlines()
    for line in lines:
        if not line.strip() or line.startswith("NAME") or line.startswith("USER"):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        sessions.append({
            "username": parts[0],
            "tty": parts[1],
            "login_at": " ".join(parts[2:4]) if len(parts) >= 4 else parts[2],
            "host": parts[4].strip("()") if len(parts) >= 5 else "",
        })
    return ok(sessions)
