import json
import shutil
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models.envelope import ok, fail
from utils.validators import validate_zfs_pool, validate_block_device, validate_safe_path
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/storage", tags=["Storage"])


# ---------- Disks & Partitions ----------

@router.get("/disks")
def list_disks():
    if not shutil.which("lsblk"):
        return fail("'lsblk' not installed")
    success, output = run_cmd([
        "lsblk", "-J", "-b", "-o",
        "NAME,PATH,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL,SERIAL,FSUSED,FSAVAIL,FSUSE%",
    ])
    if not success:
        return fail(output)
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return fail("Failed to parse lsblk output")

    def map_node(n: dict) -> dict:
        children = [map_node(c) for c in n.get("children", [])] if n.get("children") else []
        return {
            "name": n.get("name", ""),
            "path": n.get("path", ""),
            "size_bytes": int(n.get("size") or 0),
            "type": n.get("type", ""),
            "mountpoint": n.get("mountpoint") or "",
            "fstype": n.get("fstype") or "",
            "model": n.get("model") or "",
            "serial": n.get("serial") or "",
            "fs_used_bytes": int(n.get("fsused") or 0) if n.get("fsused") else None,
            "fs_avail_bytes": int(n.get("fsavail") or 0) if n.get("fsavail") else None,
            "fs_use_percent": n.get("fsuse%") or None,
            "children": children,
        }

    return ok([map_node(n) for n in data.get("blockdevices", [])])


@router.get("/disks/{device}/smart")
def disk_smart(device: str):
    if not validate_block_device(device):
        raise HTTPException(status_code=400, detail=fail("Invalid block device name"))
    if not shutil.which("smartctl"):
        return fail("'smartctl' not installed")
    success, output = run_cmd(["smartctl", "-a", "-j", f"/dev/{device}"], timeout=20)
    # smartctl exits non-zero for various non-fatal conditions but still emits valid JSON
    try:
        data = json.loads(output)
        return ok(data)
    except json.JSONDecodeError:
        if not success:
            return fail(output)
        return fail("Failed to parse smartctl output")


@router.get("/du")
def du_paths(paths: str = Query(..., max_length=4096)):
    raw = [p.strip() for p in paths.split(",") if p.strip()]
    if not raw:
        raise HTTPException(status_code=400, detail=fail("At least one path required"))
    if len(raw) > 5:
        raise HTTPException(status_code=400, detail=fail("Maximum 5 paths per request"))
    for p in raw:
        if not validate_safe_path(p):
            raise HTTPException(status_code=400, detail=fail(f"Invalid path: {p}"))
    if not shutil.which("du"):
        return fail("'du' not installed")
    results = []
    for p in raw:
        success, output = run_cmd(["du", "-sh", "-x", p], timeout=60)
        if success and output:
            parts = output.split(None, 1)
            size = parts[0] if parts else "?"
            results.append({"path": p, "size": size, "ok": True})
        else:
            results.append({"path": p, "size": None, "ok": False, "error": output})
    return ok(results)


# ---------- ZFS ----------

@router.get("/zfs/pools")
def list_zfs_pools():
    if not shutil.which("zpool"):
        return fail("ZFS not installed")
    success, output = run_cmd(["zpool", "list", "-H", "-o", "name,size,alloc,free,health"])
    if not success:
        return fail(f"ZFS not available: {output}")

    pools = []
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) >= 5:
            pools.append({
                "name": parts[0], "size": parts[1],
                "allocated": parts[2], "free": parts[3], "health": parts[4],
            })
    return ok(pools)


@router.get("/zfs/pools/{name}")
def get_zfs_pool(name: str):
    if not validate_zfs_pool(name):
        raise HTTPException(status_code=400, detail=fail("Invalid pool name"))

    if not shutil.which("zpool"):
        return fail("ZFS not installed")
    success, output = run_cmd(["zpool", "status", name])
    if not success:
        return fail(f"ZFS pool '{name}' error: {output}")

    pool_info = {"name": name, "raw_output": output}
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("state:"):
            pool_info["health"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("scan:"):
            pool_info["scan"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("errors:"):
            pool_info["errors"] = stripped.split(":", 1)[1].strip()
    return ok(pool_info)


# ---------- Kubernetes PVCs ----------

@router.get("/kubernetes/pvc")
def list_kubernetes_pvcs():
    if not shutil.which("kubectl"):
        return fail("kubectl not installed")
    success, output = run_cmd(["kubectl", "get", "pvc", "--all-namespaces", "-o", "json"])
    if not success:
        return fail(f"kubectl not available: {output}")

    try:
        data = json.loads(output)
        pvcs = []
        for item in data.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            status = item.get("status", {})
            pvcs.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "status": status.get("phase", ""),
                "capacity": status.get("capacity", {}).get("storage", ""),
                "storage_class": spec.get("storageClassName", ""),
                "volume_name": spec.get("volumeName", ""),
                "access_modes": spec.get("accessModes", []),
            })
        return ok(pvcs)
    except json.JSONDecodeError:
        return fail("Failed to parse kubectl output")
