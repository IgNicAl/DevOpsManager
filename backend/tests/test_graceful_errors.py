from unittest.mock import patch


def test_zfs_pools_when_zpool_not_installed(client):
    with patch("routers.storage.run_cmd", return_value=(False, "zpool is not installed or not in PATH")):
        resp = client.get("/api/storage/zfs/pools")
        body = resp.json()
        assert body["success"] is False
        assert "not available" in body["error"].lower() or "not installed" in body["error"].lower()


def test_kubernetes_nodes_when_kubectl_not_installed(client):
    with patch("routers.kubernetes.run_cmd", return_value=(False, "kubectl is not installed or not in PATH")):
        resp = client.get("/api/kubernetes/nodes")
        body = resp.json()
        assert body["success"] is False
        assert "not available" in body["error"].lower() or "not installed" in body["error"].lower()


def test_tailscale_when_not_installed(client):
    with patch("routers.network.run_cmd", return_value=(False, "tailscale is not installed or not in PATH")):
        resp = client.get("/api/network/tailscale/peers")
        body = resp.json()
        assert body["success"] is False


def test_cloudflare_when_not_installed(client):
    with patch("routers.network.run_cmd", return_value=(False, "cloudflared is not installed or not in PATH")):
        resp = client.get("/api/network/cloudflare/tunnels")
        body = resp.json()
        assert body["success"] is False


def test_gitops_sync_without_confirm(client):
    resp = client.post("/api/gitops/applications/my-app/sync", json={"confirm": False})
    assert resp.status_code == 400
