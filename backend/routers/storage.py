import json

from fastapi import APIRouter, HTTPException

from models.envelope import ok, fail
from utils.validators import validate_zfs_pool
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/storage", tags=["Storage"])


@router.get("/zfs/pools")
def list_zfs_pools():
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


@router.get("/kubernetes/pvc")
def list_kubernetes_pvcs():
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
