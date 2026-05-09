from utils.validators import (
    validate_service_name,
    validate_k8s_name,
    validate_zfs_pool,
    validate_docker_id,
)


def test_valid_service_names():
    assert validate_service_name("nginx")
    assert validate_service_name("docker.service")
    assert validate_service_name("ssh@0")
    assert validate_service_name("my-custom_service.timer")


def test_invalid_service_names():
    assert not validate_service_name("")
    assert not validate_service_name("../etc/passwd")
    assert not validate_service_name("service; rm -rf /")
    assert not validate_service_name("service\nnewline")


def test_valid_k8s_names():
    assert validate_k8s_name("default")
    assert validate_k8s_name("my-pod-123")
    assert validate_k8s_name("kube-system")


def test_invalid_k8s_names():
    assert not validate_k8s_name("")
    assert not validate_k8s_name("-starts-with-dash")
    assert not validate_k8s_name("UPPERCASE")
    assert not validate_k8s_name("has space")


def test_valid_zfs_pool_names():
    assert validate_zfs_pool("rpool")
    assert validate_zfs_pool("data-pool_1")


def test_invalid_zfs_pool_names():
    assert not validate_zfs_pool("")
    assert not validate_zfs_pool("pool; rm -rf /")
    assert not validate_zfs_pool("../../etc")


def test_valid_docker_ids():
    assert validate_docker_id("abc123def456")  # 12 char hex
    assert validate_docker_id("my-container")   # named container
    assert validate_docker_id("nginx.latest")


def test_invalid_docker_ids():
    assert not validate_docker_id("")
    assert not validate_docker_id("-starts-with-dash")
    assert not validate_docker_id("has space")
