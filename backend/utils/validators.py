import ipaddress
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

# Docker network/volume names
DOCKER_NETWORK_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,62}$")
DOCKER_VOLUME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,62}$")

# Docker image references: registry/repo:tag style
DOCKER_IMAGE_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-/:@]{0,254}$")

# Linux network interface name (max 15 chars per IFNAMSIZ)
IFACE_RE = re.compile(r"^[a-zA-Z0-9_.\-]{1,15}$")

# Hostname / domain (RFC 1123, simplified)
HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$"
)

# VLAN id 1-4094
VLAN_ID_RE = re.compile(r"^([1-9]|[1-9][0-9]{1,2}|[1-3][0-9]{3}|40[0-8][0-9]|409[0-4])$")

# Linux usernames
USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")

# Block device names (no /dev/ prefix)
BLOCK_DEVICE_RE = re.compile(r"^[a-zA-Z0-9]{1,32}$")

# Cron field: digits, *, ,, -, /
CRON_FIELD_RE = re.compile(r"^[\d\*,\-/]+$")

# Port specification: "8080", "8080:80", "8080:80/tcp"
PORT_SPEC_RE = re.compile(r"^\d{1,5}(:\d{1,5})?(/(tcp|udp))?$")

# Volume specification: "/host:/container" or "/host:/container:ro"
VOLUME_SPEC_RE = re.compile(r"^/[\w\-./]+:/[\w\-./]+(:(ro|rw|z|Z))?$")

# Filesystem path (no traversal)
SAFE_PATH_RE = re.compile(r"^/[\w\-./]+$")

# DNS record types
DNS_TYPE_RE = re.compile(r"^(A|AAAA|MX|TXT|CNAME|NS|SOA|PTR)$")

# Cron user (current or root or alphanumeric username)
CRON_USER_RE = re.compile(r"^(current|[a-z_][a-z0-9_-]{0,31})$")

# Docker restart policies
DOCKER_RESTART_POLICIES = {"no", "always", "on-failure", "unless-stopped"}

# Docker network drivers (allowlist)
DOCKER_NETWORK_DRIVERS = {"bridge", "overlay", "macvlan", "host", "none"}


def validate_service_name(name: str) -> bool:
    return bool(SERVICE_NAME_RE.match(name)) and len(name) <= 256


def validate_k8s_name(name: str) -> bool:
    return bool(K8S_NAME_RE.match(name)) and len(name) <= 253


def validate_zfs_pool(name: str) -> bool:
    return bool(ZFS_POOL_RE.match(name)) and len(name) <= 256


def validate_docker_id(identifier: str) -> bool:
    return bool(DOCKER_ID_RE.match(identifier)) or bool(DOCKER_NAME_RE.match(identifier))


def validate_docker_name(name: str) -> bool:
    return bool(DOCKER_NAME_RE.fullmatch(name)) and len(name) <= 64


def validate_docker_network(name: str) -> bool:
    return bool(DOCKER_NETWORK_RE.fullmatch(name))


def validate_docker_volume(name: str) -> bool:
    return bool(DOCKER_VOLUME_RE.fullmatch(name))


def validate_docker_image(image: str) -> bool:
    return bool(DOCKER_IMAGE_RE.fullmatch(image))


def validate_iface(name: str) -> bool:
    return bool(IFACE_RE.fullmatch(name))


def validate_hostname(name: str) -> bool:
    if not name or len(name) > 253:
        return False
    return bool(HOSTNAME_RE.fullmatch(name))


def validate_host(name: str) -> bool:
    """Hostname OR IP address."""
    if validate_hostname(name):
        return True
    try:
        ipaddress.ip_address(name)
        return True
    except ValueError:
        return False


def validate_ip(addr: str) -> bool:
    try:
        ipaddress.ip_address(addr)
        return True
    except ValueError:
        return False


def validate_vlan_id(vid) -> bool:
    return bool(VLAN_ID_RE.fullmatch(str(vid)))


def validate_username(name: str) -> bool:
    return bool(USERNAME_RE.fullmatch(name))


def validate_block_device(name: str) -> bool:
    return bool(BLOCK_DEVICE_RE.fullmatch(name))


def validate_cron_field(field: str) -> bool:
    return bool(CRON_FIELD_RE.fullmatch(field)) and len(field) <= 64


def validate_port_spec(spec: str) -> bool:
    return bool(PORT_SPEC_RE.fullmatch(spec))


def validate_volume_spec(spec: str) -> bool:
    return bool(VOLUME_SPEC_RE.fullmatch(spec)) and ".." not in spec


def validate_safe_path(path: str) -> bool:
    if ".." in path:
        return False
    return bool(SAFE_PATH_RE.fullmatch(path)) and len(path) <= 4096


def validate_dns_type(rtype: str) -> bool:
    return bool(DNS_TYPE_RE.fullmatch(rtype))


def validate_cron_user(user: str) -> bool:
    return bool(CRON_USER_RE.fullmatch(user))


def validate_docker_restart_policy(policy: str) -> bool:
    return policy in DOCKER_RESTART_POLICIES


def validate_docker_network_driver(driver: str) -> bool:
    return driver in DOCKER_NETWORK_DRIVERS


def validate_cron_command(cmd: str) -> bool:
    """Reject obvious shell metacharacters that enable injection in crontab context."""
    if not cmd or len(cmd) > 4096:
        return False
    # crontab itself runs commands via /bin/sh, so we cannot block all shell;
    # but reject sequences that strongly suggest injection chains.
    forbidden = ["`", "$(", "\n", "\r"]
    return not any(seq in cmd for seq in forbidden)
