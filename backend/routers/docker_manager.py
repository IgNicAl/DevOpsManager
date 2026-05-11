import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from models.envelope import ok, fail
from utils.sse import sse_event
from utils.validators import (
    validate_docker_id,
    validate_docker_name,
    validate_docker_network,
    validate_docker_volume,
    validate_docker_image,
    validate_docker_restart_policy,
    validate_docker_network_driver,
    validate_port_spec,
    validate_volume_spec,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/docker", tags=["Docker"])


def get_docker_client():
    """Lazy Docker client — fails gracefully if Docker is not available."""
    try:
        import docker
        return docker.from_env()
    except Exception as exc:
        logger.warning("Docker not available: %s", exc)
        return None


# ---------- Containers ----------

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


@router.get("/containers/{container_id}/inspect")
def inspect_container(container_id: str):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        attrs = client.api.inspect_container(container_id)
        cfg = attrs.get("Config", {})
        host = attrs.get("HostConfig", {})
        return ok({
            "id": attrs.get("Id", "")[:12],
            "name": attrs.get("Name", "").lstrip("/"),
            "image": cfg.get("Image", ""),
            "command": cfg.get("Cmd") or [],
            "entrypoint": cfg.get("Entrypoint") or [],
            "env": cfg.get("Env") or [],
            "labels": cfg.get("Labels") or {},
            "working_dir": cfg.get("WorkingDir", ""),
            "exposed_ports": list((cfg.get("ExposedPorts") or {}).keys()),
            "mounts": attrs.get("Mounts", []),
            "networks": (attrs.get("NetworkSettings", {}) or {}).get("Networks", {}),
            "restart_policy": host.get("RestartPolicy", {}).get("Name", ""),
            "state": attrs.get("State", {}),
        })
    except Exception as exc:
        return fail(str(exc))


@router.get("/containers/{container_id}/stats")
def container_stats(container_id: str):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        c = client.containers.get(container_id)
        stats = c.stats(stream=False)
        mem_used = stats.get("memory_stats", {}).get("usage", 0)
        mem_limit = stats.get("memory_stats", {}).get("limit", 0)
        net_rx, net_tx = 0, 0
        for _name, n in (stats.get("networks") or {}).items():
            net_rx += n.get("rx_bytes", 0)
            net_tx += n.get("tx_bytes", 0)
        return ok({
            "cpu_percent": _calc_cpu_percent(stats),
            "mem_used_mb": round(mem_used / (1024 ** 2), 2),
            "mem_limit_mb": round(mem_limit / (1024 ** 2), 2),
            "mem_percent": round((mem_used / mem_limit) * 100, 2) if mem_limit else 0.0,
            "net_rx_b": net_rx,
            "net_tx_b": net_tx,
        })
    except Exception as exc:
        return fail(str(exc))


def _calc_cpu_percent(stats: dict) -> float:
    try:
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"]["system_cpu_usage"] - stats["precpu_stats"]["system_cpu_usage"]
        num_cpus = stats["cpu_stats"].get("online_cpus") or len(stats["cpu_stats"]["cpu_usage"].get("percpu_usage", []) or [1])
        if system_delta > 0 and cpu_delta > 0:
            return round((cpu_delta / system_delta) * num_cpus * 100.0, 2)
    except (KeyError, ZeroDivisionError, TypeError):
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


class CreateContainerBody(BaseModel):
    image: str = Field(..., max_length=256)
    name: Optional[str] = Field(None, max_length=64)
    ports: list[str] = Field(default_factory=list, max_length=64)
    volumes: list[str] = Field(default_factory=list, max_length=64)
    env: dict[str, str] = Field(default_factory=dict)
    restart_policy: str = "no"
    command: Optional[str] = Field(None, max_length=512)


@router.post("/containers")
def create_container(body: CreateContainerBody):
    if not validate_docker_image(body.image):
        raise HTTPException(status_code=400, detail=fail("Invalid image reference"))
    if body.name and not validate_docker_name(body.name):
        raise HTTPException(status_code=400, detail=fail("Invalid container name"))
    for spec in body.ports:
        if not validate_port_spec(spec):
            raise HTTPException(status_code=400, detail=fail(f"Invalid port spec: {spec}"))
    for spec in body.volumes:
        if not validate_volume_spec(spec):
            raise HTTPException(status_code=400, detail=fail(f"Invalid volume spec: {spec}"))
    if not validate_docker_restart_policy(body.restart_policy):
        raise HTTPException(status_code=400, detail=fail("Invalid restart policy"))
    if len(body.env) > 128:
        raise HTTPException(status_code=400, detail=fail("Too many env vars (max 128)"))
    for k, v in body.env.items():
        if not k or len(k) > 256 or len(v) > 4096 or "\n" in k or "\n" in v:
            raise HTTPException(status_code=400, detail=fail("Invalid env var"))

    ports_arg: dict = {}
    for spec in body.ports:
        # "8080:80/tcp" or "8080:80" or "8080"
        proto = "tcp"
        rest = spec
        if "/" in rest:
            rest, proto = rest.split("/", 1)
        if ":" in rest:
            host, container = rest.split(":", 1)
            ports_arg[f"{container}/{proto}"] = int(host)
        else:
            ports_arg[f"{rest}/{proto}"] = None

    volumes_arg: dict = {}
    for spec in body.volumes:
        body_part, _sep, mode_part = spec.partition(":")
        if mode_part and ":" in mode_part:
            container, mode = mode_part.split(":", 1)
        else:
            container, mode = mode_part, "rw"
        volumes_arg[body_part] = {"bind": container, "mode": mode}

    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    try:
        container = client.containers.create(
            image=body.image,
            name=body.name,
            ports=ports_arg or None,
            volumes=volumes_arg or None,
            environment=body.env or None,
            restart_policy={"Name": body.restart_policy},
            command=body.command,
            detach=True,
        )
        return ok({"id": container.short_id, "name": container.name, "message": "Container created"})
    except Exception as exc:
        return fail(str(exc))


class RenameContainerBody(BaseModel):
    name: str = Field(..., max_length=64)


@router.post("/containers/{container_id}/rename")
def rename_container(container_id: str, body: RenameContainerBody):
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    if not validate_docker_name(body.name):
        raise HTTPException(status_code=400, detail=fail("Invalid container name"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        c = client.containers.get(container_id)
        c.rename(body.name)
        return ok({"id": container_id, "name": body.name})
    except Exception as exc:
        return fail(str(exc))


class ConnectNetworkBody(BaseModel):
    container_id: str = Field(..., max_length=64)


@router.post("/networks/{network_name}/connect")
def connect_container_to_network(network_name: str, body: ConnectNetworkBody):
    if not validate_docker_network(network_name):
        raise HTTPException(status_code=400, detail=fail("Invalid network name"))
    if not validate_docker_id(body.container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        net = client.networks.get(network_name)
        net.connect(body.container_id)
        return ok({"network": network_name, "container_id": body.container_id, "message": "connected"})
    except Exception as exc:
        return fail(str(exc))


@router.delete("/networks/{network_name}/disconnect/{container_id}")
def disconnect_container_from_network(network_name: str, container_id: str):
    if not validate_docker_network(network_name):
        raise HTTPException(status_code=400, detail=fail("Invalid network name"))
    if not validate_docker_id(container_id):
        raise HTTPException(status_code=400, detail=fail("Invalid container ID"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        net = client.networks.get(network_name)
        net.disconnect(container_id, force=True)
        return ok({"network": network_name, "container_id": container_id, "message": "disconnected"})
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


# ---------- Images ----------

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


class PullImageQuery(BaseModel):
    image: str


@router.get("/images/pull")
async def pull_image(request: Request, image: str):
    if not validate_docker_image(image):
        raise HTTPException(status_code=400, detail=fail("Invalid image reference"))

    client = get_docker_client()
    if not client:
        return fail("Docker is not available")

    async def gen():
        try:
            for chunk in client.api.pull(image, stream=True, decode=True):
                if await request.is_disconnected():
                    break
                yield sse_event("progress", chunk)
            yield sse_event("done", {"image": image})
        except Exception as exc:
            yield sse_event("error", {"error": str(exc)})

    return EventSourceResponse(gen())


# ---------- Networks ----------

@router.get("/networks")
def list_networks():
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        nets = client.networks.list()
        result = []
        for n in nets:
            attrs = n.attrs or {}
            ipam = attrs.get("IPAM", {}) or {}
            cfg_list = ipam.get("Config") or []
            subnets = [c.get("Subnet", "") for c in cfg_list if c.get("Subnet")]
            result.append({
                "id": n.short_id,
                "name": n.name,
                "driver": attrs.get("Driver", ""),
                "scope": attrs.get("Scope", ""),
                "subnets": subnets,
                "containers": len(attrs.get("Containers") or {}),
            })
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


class CreateNetworkBody(BaseModel):
    name: str = Field(..., max_length=64)
    driver: str = "bridge"
    subnet: Optional[str] = None


@router.post("/networks")
def create_network(body: CreateNetworkBody):
    if not validate_docker_network(body.name):
        raise HTTPException(status_code=400, detail=fail("Invalid network name"))
    if not validate_docker_network_driver(body.driver):
        raise HTTPException(status_code=400, detail=fail("Invalid network driver"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        ipam = None
        if body.subnet:
            import ipaddress
            try:
                ipaddress.ip_network(body.subnet, strict=False)
            except ValueError:
                raise HTTPException(status_code=400, detail=fail("Invalid subnet"))
            import docker as docker_lib
            ipam = docker_lib.types.IPAMConfig(
                pool_configs=[docker_lib.types.IPAMPool(subnet=body.subnet)]
            )
        net = client.networks.create(name=body.name, driver=body.driver, ipam=ipam)
        return ok({"id": net.short_id, "name": net.name, "message": "Network created"})
    except HTTPException:
        raise
    except Exception as exc:
        return fail(str(exc))


class DeleteNetworkBody(BaseModel):
    confirm: bool = False


@router.delete("/networks/{name}")
def delete_network(name: str, body: DeleteNetworkBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_docker_network(name):
        raise HTTPException(status_code=400, detail=fail("Invalid network name"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        net = client.networks.get(name)
        net.remove()
        return ok({"name": name, "message": "Network removed"})
    except Exception as exc:
        return fail(str(exc))


# ---------- Volumes ----------

@router.get("/volumes")
def list_volumes():
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        vols = client.volumes.list()
        result = []
        for v in vols:
            attrs = v.attrs or {}
            result.append({
                "name": v.name,
                "driver": attrs.get("Driver", ""),
                "mountpoint": attrs.get("Mountpoint", ""),
                "scope": attrs.get("Scope", ""),
                "created_at": attrs.get("CreatedAt", ""),
                "labels": attrs.get("Labels") or {},
            })
        return ok(result)
    except Exception as exc:
        return fail(str(exc))


@router.get("/volumes/{name}/inspect")
def inspect_volume(name: str):
    if not validate_docker_volume(name):
        raise HTTPException(status_code=400, detail=fail("Invalid volume name"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        v = client.volumes.get(name)
        return ok(v.attrs)
    except Exception as exc:
        return fail(str(exc))


class DeleteVolumeBody(BaseModel):
    confirm: bool = False


@router.delete("/volumes/{name}")
def delete_volume(name: str, body: DeleteVolumeBody):
    if not body.confirm:
        raise HTTPException(status_code=400, detail=fail("Confirmation required: set confirm=true"))
    if not validate_docker_volume(name):
        raise HTTPException(status_code=400, detail=fail("Invalid volume name"))
    client = get_docker_client()
    if not client:
        return fail("Docker is not available")
    try:
        v = client.volumes.get(name)
        v.remove(force=True)
        return ok({"name": name, "message": "Volume removed"})
    except Exception as exc:
        return fail(str(exc))
