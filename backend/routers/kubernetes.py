import json

from fastapi import APIRouter, HTTPException

from models.envelope import ok, fail
from utils.validators import validate_k8s_name
from utils.subprocess_runner import run_cmd

router = APIRouter(prefix="/api/kubernetes", tags=["Kubernetes"])


@router.get("/nodes")
def list_nodes():
    success, output = run_cmd(["kubectl", "get", "nodes", "-o", "json"])
    if not success:
        return fail(f"kubectl not available: {output}")

    try:
        data = json.loads(output)
        nodes = []
        for item in data.get("items", []):
            meta = item.get("metadata", {})
            status = item.get("status", {})
            conditions = status.get("conditions", [])
            ready = next((c for c in conditions if c.get("type") == "Ready"), {})
            capacity = status.get("capacity", {})
            info = status.get("nodeInfo", {})
            labels = meta.get("labels", {})

            roles = [k.replace("node-role.kubernetes.io/", "")
                     for k in labels if k.startswith("node-role.kubernetes.io/")]

            nodes.append({
                "name": meta.get("name", ""),
                "status": "Ready" if ready.get("status") == "True" else "NotReady",
                "roles": roles or ["<none>"],
                "cpu_capacity": capacity.get("cpu", ""),
                "memory_capacity": capacity.get("memory", ""),
                "k3s_version": info.get("kubeletVersion", ""),
                "os_image": info.get("osImage", ""),
                "created": meta.get("creationTimestamp", ""),
            })
        return ok(nodes)
    except json.JSONDecodeError:
        return fail("Failed to parse kubectl output")


@router.get("/pods")
def list_pods():
    success, output = run_cmd(["kubectl", "get", "pods", "--all-namespaces", "-o", "json"])
    if not success:
        return fail(f"kubectl not available: {output}")

    try:
        data = json.loads(output)
        pods = []
        for item in data.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            status = item.get("status", {})
            container_statuses = status.get("containerStatuses", [])

            restarts = sum(cs.get("restartCount", 0) for cs in container_statuses)
            containers = [{"name": cs.get("name", ""), "ready": cs.get("ready", False),
                           "state": list(cs.get("state", {}).keys())[0] if cs.get("state") else "unknown"}
                          for cs in container_statuses]

            pods.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "status": status.get("phase", "Unknown"),
                "restarts": restarts,
                "node": spec.get("nodeName", ""),
                "created": meta.get("creationTimestamp", ""),
                "containers": containers,
            })
        return ok(pods)
    except json.JSONDecodeError:
        return fail("Failed to parse kubectl output")


@router.get("/deployments")
def list_deployments():
    success, output = run_cmd(["kubectl", "get", "deployments", "--all-namespaces", "-o", "json"])
    if not success:
        return fail(f"kubectl not available: {output}")

    try:
        data = json.loads(output)
        deployments = []
        for item in data.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            status = item.get("status", {})
            containers = spec.get("template", {}).get("spec", {}).get("containers", [])

            deployments.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "desired": spec.get("replicas", 0),
                "ready": status.get("readyReplicas", 0),
                "available": status.get("availableReplicas", 0),
                "images": [c.get("image", "") for c in containers],
                "created": meta.get("creationTimestamp", ""),
            })
        return ok(deployments)
    except json.JSONDecodeError:
        return fail("Failed to parse kubectl output")


@router.get("/pods/{namespace}/{pod}/events")
def get_pod_events(namespace: str, pod: str):
    if not validate_k8s_name(namespace):
        raise HTTPException(status_code=400, detail=fail("Invalid namespace"))
    if not validate_k8s_name(pod):
        raise HTTPException(status_code=400, detail=fail("Invalid pod name"))

    success, output = run_cmd([
        "kubectl", "get", "events", "-n", namespace,
        f"--field-selector=involvedObject.name={pod}", "-o", "json",
    ])
    if not success:
        return fail(output)

    try:
        data = json.loads(output)
        events = []
        for item in data.get("items", []):
            events.append({
                "type": item.get("type", ""),
                "reason": item.get("reason", ""),
                "message": item.get("message", ""),
                "timestamp": item.get("lastTimestamp") or item.get("eventTime", ""),
            })
        return ok(events)
    except json.JSONDecodeError:
        return fail("Failed to parse kubectl output")
