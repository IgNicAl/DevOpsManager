from unittest.mock import patch


def test_kill_process_without_confirm_returns_error(client):
    resp = client.request("DELETE", "/api/processes/1", json={"confirm": False})
    assert resp.status_code == 400


def test_kill_process_with_invalid_signal(client):
    resp = client.request("DELETE", "/api/processes/1", json={"confirm": True, "signal": "SIGFOO"})
    assert resp.status_code == 400


def test_service_action_without_confirm_returns_error(client):
    resp = client.post("/api/services/action", json={
        "service": "nginx", "action": "restart", "confirm": False,
    })
    assert resp.status_code == 400


def test_service_action_with_invalid_name(client):
    resp = client.post("/api/services/action", json={
        "service": "../etc/passwd", "action": "restart", "confirm": True,
    })
    assert resp.status_code == 400


def test_service_action_with_invalid_action(client):
    resp = client.post("/api/services/action", json={
        "service": "nginx", "action": "destroy", "confirm": True,
    })
    assert resp.status_code == 400


def test_docker_containers_when_docker_unavailable(client):
    with patch("routers.docker_manager.get_docker_client", return_value=None):
        resp = client.get("/api/docker/containers")
        body = resp.json()
        assert body["success"] is False
        assert "not available" in body["error"]


def test_docker_container_action_without_confirm(client):
    resp = client.post("/api/docker/containers/action", json={
        "container_id": "abc123def456", "action": "stop", "confirm": False,
    })
    assert resp.status_code == 400


def test_docker_delete_image_without_confirm(client):
    resp = client.request("DELETE", "/api/docker/images/abc123def456", json={"confirm": False})
    assert resp.status_code == 400
