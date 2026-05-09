import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.envelope import ok, fail
from utils.validators import validate_k8s_name
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/gitops", tags=["GitOps"])


@router.get("/applications")
def list_applications():
    success, output = run_cmd([
        "kubectl", "get", "applications.argoproj.io",
        "--all-namespaces", "-o", "json",
    ])
    if not success:
        if "the server doesn't have a resource type" in output.lower() or "no matches for kind" in output.lower():
            return fail("ArgoCD is not installed (CRD not found)")
        return fail(f"kubectl error: {output}")

    try:
        data = json.loads(output)
        apps = []
        for item in data.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            status = item.get("status", {})
            sync = status.get("sync", {})
            health = status.get("health", {})
            source = spec.get("source", {})
            history = status.get("history", [])
            last_commit = history[-1].get("revision", "")[:7] if history else ""

            apps.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "sync_status": sync.get("status", "Unknown"),
                "health_status": health.get("status", "Unknown"),
                "repo_url": source.get("repoURL", ""),
                "target_revision": source.get("targetRevision", ""),
                "last_sync_time": status.get("operationState", {}).get("finishedAt", ""),
                "last_commit_hash": last_commit,
            })
        return ok(apps)
    except json.JSONDecodeError:
        return fail("Failed to parse kubectl output")


class SyncBody(BaseModel):
    confirm: bool = False


@router.post("/applications/{name}/sync")
def sync_application(name: str, body: SyncBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))

    if not validate_k8s_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid application name"))

    patch_json = json.dumps({
        "operation": {
            "initiatedBy": {"username": "devops-manager"},
            "sync": {},
        }
    })

    success, output = run_cmd([
        "kubectl", "patch", "application", name,
        "-n", "argocd", "--type", "merge", "-p", patch_json,
    ])
    if not success:
        return fail(output)

    return ok({"name": name, "message": "Sync triggered"})


@router.get("/applications/{name}/diff")
def application_diff(name: str):
    if not validate_k8s_name(name):
        raise HTTPException(status_code=400, detail=fail("Invalid application name"))

    success, output = run_cmd(["argocd", "app", "diff", name, "--local-repo-root", "/tmp"], timeout=60)
    if not success:
        # argocd diff exits non-zero when there IS a diff — that's expected
        if output:
            return ok({"diff": output, "has_diff": True})
        return fail(f"ArgoCD CLI error: {output}")

    return ok({"diff": output, "has_diff": bool(output.strip())})
