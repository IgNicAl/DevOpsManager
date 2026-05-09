import json
import os
import logging

import httpx
from fastapi import APIRouter

from models.envelope import ok, fail

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backups", tags=["Backups"])

PBS_API_URL = os.environ.get("PBS_API_URL", "https://localhost:8007")
PBS_API_TOKEN = os.environ.get("PBS_API_TOKEN", "")
PBS_DATASTORE = os.environ.get("PBS_DATASTORE", "local")
OFFSITE_CONFIG_PATH = "/etc/devops-manager/offsite-sync.json"


def _pbs_headers() -> dict:
    """Build auth headers for PBS API. Token never logged."""
    return {"Authorization": f"PBSAPIToken={PBS_API_TOKEN}"} if PBS_API_TOKEN else {}


@router.get("/pbs/jobs")
async def pbs_jobs():
    if not PBS_API_TOKEN:
        return fail("PBS_API_TOKEN not configured")

    url = f"{PBS_API_URL}/api2/json/admin/datastore/{PBS_DATASTORE}/snapshots"
    try:
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
            resp = await client.get(url, headers=_pbs_headers())
            resp.raise_for_status()
            data = resp.json().get("data", [])

            jobs = []
            for snap in data:
                jobs.append({
                    "backup_type": snap.get("backup-type", ""),
                    "backup_id": snap.get("backup-id", ""),
                    "backup_time": snap.get("backup-time", 0),
                    "size": snap.get("size", 0),
                    "verify_state": snap.get("verification", {}).get("state", "none"),
                })
            return ok(jobs)
    except httpx.ConnectError:
        return fail("Cannot connect to Proxmox Backup Server")
    except httpx.HTTPStatusError as exc:
        return fail(f"PBS API error: {exc.response.status_code}")
    except Exception as exc:
        logger.exception("PBS jobs error")
        return fail(f"PBS error: {exc}")


@router.get("/pbs/summary")
async def pbs_summary():
    if not PBS_API_TOKEN:
        return fail("PBS_API_TOKEN not configured")

    url = f"{PBS_API_URL}/api2/json/admin/datastore/{PBS_DATASTORE}/snapshots"
    try:
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
            resp = await client.get(url, headers=_pbs_headers())
            resp.raise_for_status()
            data = resp.json().get("data", [])

            if not data:
                return ok({"last_backup_time": None, "total_snapshots": 0, "total_size_bytes": 0})

            times = [s.get("backup-time", 0) for s in data]
            total_size = sum(s.get("size", 0) for s in data)

            return ok({
                "last_backup_time": max(times),
                "total_snapshots": len(data),
                "total_size_bytes": total_size,
            })
    except httpx.ConnectError:
        return fail("Cannot connect to Proxmox Backup Server")
    except Exception as exc:
        return fail(f"PBS error: {exc}")


@router.get("/offsite")
def offsite_sync_status():
    if not os.path.exists(OFFSITE_CONFIG_PATH):
        return ok({"syncs": [], "note": f"Config file not found at {OFFSITE_CONFIG_PATH}"})

    try:
        with open(OFFSITE_CONFIG_PATH, "r") as f:
            data = json.load(f)
        return ok({"syncs": data})
    except json.JSONDecodeError:
        return fail("Invalid JSON in offsite config file")
    except PermissionError:
        return fail(f"Permission denied reading {OFFSITE_CONFIG_PATH}")
    except Exception as exc:
        return fail(str(exc))
