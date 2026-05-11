from utils.validators import (
    validate_iface,
    validate_hostname,
    validate_host,
    validate_ip,
    validate_vlan_id,
    validate_username,
    validate_block_device,
    validate_cron_field,
    validate_cron_command,
    validate_port_spec,
    validate_volume_spec,
    validate_safe_path,
    validate_dns_type,
    validate_docker_image,
    validate_docker_network,
    validate_docker_restart_policy,
)


def test_iface_accepts_common_names():
    assert validate_iface("eth0")
    assert validate_iface("wlan0")
    assert validate_iface("eth0.100")
    assert validate_iface("br-1234abcd")


def test_iface_rejects_injection():
    assert not validate_iface("eth0; rm -rf /")
    assert not validate_iface("eth0 | cat")
    assert not validate_iface("eth0\n")
    assert not validate_iface("")
    # exceeds IFNAMSIZ (15)
    assert not validate_iface("a" * 16)


def test_hostname_accepts():
    assert validate_hostname("example.com")
    assert validate_hostname("sub.example.co.uk")
    assert validate_hostname("api-server")


def test_hostname_rejects_injection():
    assert not validate_hostname("example.com; ls")
    assert not validate_hostname("a..b")
    assert not validate_hostname("-leading.com")
    assert not validate_hostname("")


def test_host_accepts_ip_and_name():
    assert validate_host("10.0.0.1")
    assert validate_host("::1")
    assert validate_host("example.com")
    assert not validate_host("not a host!")


def test_ip_accepts_v4_v6():
    assert validate_ip("192.168.1.1")
    assert validate_ip("2001:db8::1")
    assert not validate_ip("999.999.999.999")
    assert not validate_ip("hello")


def test_vlan_id_range():
    assert validate_vlan_id(1)
    assert validate_vlan_id(4094)
    assert validate_vlan_id("100")
    assert not validate_vlan_id(0)
    assert not validate_vlan_id(4095)
    assert not validate_vlan_id("abc")


def test_username_pattern():
    assert validate_username("user1")
    assert validate_username("_systemd")
    assert not validate_username("User")  # uppercase
    assert not validate_username("1user")
    assert not validate_username("user;rm")


def test_block_device():
    assert validate_block_device("sda")
    assert validate_block_device("nvme0n1")
    assert not validate_block_device("../etc/shadow")
    assert not validate_block_device("sda; rm")


def test_cron_field():
    assert validate_cron_field("*")
    assert validate_cron_field("*/5")
    assert validate_cron_field("0,15,30,45")
    assert validate_cron_field("1-5")
    assert not validate_cron_field("hello")
    assert not validate_cron_field("$(id)")


def test_cron_command():
    assert validate_cron_command("/usr/bin/echo hi")
    assert validate_cron_command("/bin/sh -c 'do_something'")
    assert not validate_cron_command("foo `id`")
    assert not validate_cron_command("foo $(id)")
    assert not validate_cron_command("foo\nbar")


def test_port_spec():
    assert validate_port_spec("8080")
    assert validate_port_spec("8080:80")
    assert validate_port_spec("8080:80/tcp")
    assert validate_port_spec("8080:80/udp")
    assert not validate_port_spec("foo")
    assert not validate_port_spec("8080:80; rm")


def test_volume_spec():
    assert validate_volume_spec("/host/path:/container/path")
    assert validate_volume_spec("/host:/container:ro")
    assert not validate_volume_spec("/host/..:/container")
    assert not validate_volume_spec("relative:/container")


def test_safe_path():
    assert validate_safe_path("/var/log")
    assert not validate_safe_path("/var/../etc")
    assert not validate_safe_path("relative")


def test_dns_type():
    assert validate_dns_type("A")
    assert validate_dns_type("MX")
    assert not validate_dns_type("ZZ")
    assert not validate_dns_type("a")  # lowercase rejected by regex


def test_docker_image_pattern():
    assert validate_docker_image("nginx")
    assert validate_docker_image("nginx:latest")
    assert validate_docker_image("registry.example.com/team/image:v1.2.3")
    assert not validate_docker_image("nginx; rm")
    assert not validate_docker_image("")


def test_docker_network_name():
    assert validate_docker_network("my-net")
    assert not validate_docker_network("../my-net")


def test_restart_policy():
    assert validate_docker_restart_policy("always")
    assert validate_docker_restart_policy("unless-stopped")
    assert not validate_docker_restart_policy("nope")
