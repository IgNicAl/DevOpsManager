import re

# Systemd service names: letters, digits, @, ., _, -
SERVICE_NAME_RE = re.compile(r"^[a-zA-Z0-9@._\-]+$")

# Kubernetes resource names: lowercase alphanumeric, hyphens, dots
K8S_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9\-\.]*$")

# ZFS pool names: letters, digits, _, -
ZFS_POOL_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")

# Docker container/image short IDs: hex, 12 chars (short) or 64 chars (full)
DOCKER_ID_RE = re.compile(r"^[a-f0-9]{12,64}$")

# Docker container names: alphanumeric, _, ., -
DOCKER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$")


def validate_service_name(name: str) -> bool:
    """Validate a systemd service name against allowlist."""
    return bool(SERVICE_NAME_RE.match(name)) and len(name) <= 256


def validate_k8s_name(name: str) -> bool:
    """Validate a Kubernetes resource name (namespace, pod, deployment)."""
    return bool(K8S_NAME_RE.match(name)) and len(name) <= 253


def validate_zfs_pool(name: str) -> bool:
    """Validate a ZFS pool name."""
    return bool(ZFS_POOL_RE.match(name)) and len(name) <= 256


def validate_docker_id(identifier: str) -> bool:
    """Validate a Docker container/image ID or name."""
    return bool(DOCKER_ID_RE.match(identifier)) or bool(DOCKER_NAME_RE.match(identifier))
