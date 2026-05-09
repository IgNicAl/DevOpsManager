

def test_health_returns_200(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
    assert "timestamp" in body["data"]


def test_system_overview_returns_data(client):
    resp = client.get("/api/system/overview")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert "cpu_percent" in data
    assert "ram_used_gb" in data
    assert "ram_total_gb" in data
    assert "hostname" in data
    assert "uptime_seconds" in data


def test_system_cpu_returns_data(client):
    resp = client.get("/api/system/cpu")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "per_core_percent" in body["data"]
    assert "load_average" in body["data"]


def test_system_memory_returns_data(client):
    resp = client.get("/api/system/memory")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "ram" in body["data"]
    assert "swap" in body["data"]


def test_system_disk_returns_data(client):
    resp = client.get("/api/system/disk")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)


def test_system_network_returns_data(client):
    resp = client.get("/api/system/network")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
