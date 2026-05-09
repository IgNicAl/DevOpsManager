import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.envelope import ok, fail
from utils.validators import validate_docker_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/docker", tags=["Docker"])


def get_docker_client():
    """Lazy Docker/Podman client — auto-negotiates API version via Unix socket."""
    try:
        import docker
        return docker.DockerClient(
            base_url="unix:///var/run/docker.sock",
            version="auto",
        )
    except Exception as exc:
        logger.warning("Docker/Podman not available: %s", exc)
        return None


@router.get("/containers")
def list_containers():
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        containers = client.containers.list(all=True)
        result = []
        for c in containers:
            result.append({
                "id": c.short_id,
                "name": c.name,
                "image": str(c.image.tags[0]) if c.image.tags else str(c.image.short_id),
                "status": c.status,
                "ports": c.ports,
                "created": c.attrs.get("Created", ""),
            })
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


@router.get("/containers/{container_id}")
def get_container(container_id: str):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))

    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        c = client.containers.get(container_id)
        stats = c.stats(stream=False)
        return ok({
            "id": c.short_id,
            "name": c.name,
            "image": str(c.image.tags[0]) if c.image.tags else str(c.image.short_id),
            "status": c.status,
            "ports": c.ports,
            "created": c.attrs.get("Created", ""),
            "env": c.attrs.get("Config", {}).get("Env", []),
            "mounts": [
                {"source": m.get("Source", ""), "destination": m.get("Destination", ""), "mode": m.get("Mode", "")}
                for m in c.attrs.get("Mounts", [])
            ],
            "network_settings": {
                name: {"ip": net.get("IPAddress", "")}
                for name, net in c.attrs.get("NetworkSettings", {}).get("Networks", {}).items()
            },
            "cpu_percent": _calc_cpu_percent(stats),
            "memory_usage_mb": round(stats.get("memory_stats", {}).get("usage", 0) / (1024 ** 2), 2),
            "memory_limit_mb": round(stats.get("memory_stats", {}).get("limit", 0) / (1024 ** 2), 2),
        })
    except Exception as exc:
        return fail(str(exc))


def _calc_cpu_percent(stats: dict) -> float:
    """Calculate CPU usage percentage from Docker stats."""
    try:
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"]["system_cpu_usage"] - stats["precpu_stats"]["system_cpu_usage"]
        num_cpus = stats["cpu_stats"]["online_cpus"]
        if system_delta > 0 and cpu_delta > 0:
            return round((cpu_delta / system_delta) * num_cpus * 100.0, 2)
    except (KeyError, ZeroDivisionError):
        pass
    return 0.0


class ContainerActionBody(BaseModel):
    container_id: str
    action: str
    confirm: bool = False


ALLOWED_CONTAINER_ACTIONS = {"start", "stop", "restart", "remove"}


@router.post("/containers/action")
def container_action(body: ContainerActionBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))

    if not validate_docker_id(body.container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))

    if body.action not in ALLOWED_CONTAINER_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=fail(f"Invalid action: {body.action}. Allowed: {', '.join(sorted(ALLOWED_CONTAINER_ACTIONS))}"),
        )

    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        container = client.containers.get(body.container_id)
        getattr(container, body.action)()
        return ok({"container_id": body.container_id, "action": body.action, "message": f"Container {body.action} executed"})
    except Exception as exc:
        return fail(str(exc))


@router.get("/containers/{container_id}/logs")
def container_logs(container_id: str, lines: int = Query(100, ge=1, le=10000)):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))

    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        container = client.containers.get(container_id)
        log_output = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        log_lines = log_output.splitlines()
        return ok({"lines": log_lines, "total": len(log_lines)})
    except Exception as exc:
        return fail(str(exc))


@router.get("/images")
def list_images():
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        images = client.images.list()
        result = []
        for img in images:
            result.append({
                "id": img.short_id.replace("sha256:", ""),
                "tags": img.tags,
                "size_mb": round(img.attrs.get("Size", 0) / (1024 ** 2), 2),
                "created": img.attrs.get("Created", ""),
            })
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


class DeleteImageBody(BaseModel):
    confirm: bool = False


@router.delete("/images/{image_id}")
def delete_image(image_id: str, body: DeleteImageBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))

    if not validate_docker_id(image_id):
        raise HTTPException(status_code=400, detail=fail("Invalid image ID"))

    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        client.images.remove(image_id, force=True)
        return ok({"image_id": image_id, "message": "Image removed"})
    except Exception as exc:
        return fail(str(exc))


@router.get("/networks")
def list_networks():
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        result = []
        for net in client.networks.list():
            ipam_configs = (net.attrs.get("IPAM") or {}).get("Config") or []
            first = ipam_configs[0] if ipam_configs else {}
            result.append({
                "id": net.short_id,
                "name": net.name,
                "driver": net.attrs.get("Driver", ""),
                "scope": net.attrs.get("Scope", ""),
                "created": net.attrs.get("Created", ""),
                "containers_count": len(net.attrs.get("Containers") or {}),
                "subnet": first.get("Subnet", ""),
                "gateway": first.get("Gateway", ""),
            })
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


@router.get("/volumes")
def list_volumes():
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        result = []
        for vol in client.volumes.list():
            usage = vol.attrs.get("UsageData") or {}
            result.append({
                "name": vol.name,
                "driver": vol.attrs.get("Driver", ""),
                "mountpoint": vol.attrs.get("Mountpoint", ""),
                "created": vol.attrs.get("CreatedAt", ""),
                "size_bytes": usage.get("Size", -1),
                "labels": vol.attrs.get("Labels") or {},
            })
        return ok(result)
    except Exception as exc:
        return fail(str(exc))
