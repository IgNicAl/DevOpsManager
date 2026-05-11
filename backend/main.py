import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.envelope import ok
from utils.alerts_engine import alerts_engine
from utils.metrics_store import metrics_store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await metrics_store.start()
    alerts_engine.load()
    await alerts_engine.start()
    try:
        yield
    finally:
        await alerts_engine.stop()
        await metrics_store.stop()


app = FastAPI(
    title="DevOps Manager API",
    description="REST API for Ubuntu Server management — system, Docker, K8s, and more.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return ok({"status": "ok", "timestamp": time.time()})


# --- Router registration ---
from routers import (  # noqa: E402
    system,
    processes,
    services,
    docker_manager,
    logs,
    storage,
    kubernetes,
    gitops,
    backups,
    network,
    dns,
    users,
    cron,
    alerts,
    terminal,
)

app.include_router(system.router)
app.include_router(processes.router)
app.include_router(services.router)
app.include_router(docker_manager.router)
app.include_router(logs.router)
app.include_router(storage.router)
app.include_router(kubernetes.router)
app.include_router(gitops.router)
app.include_router(backups.router)
app.include_router(network.router)
app.include_router(dns.router)
app.include_router(users.router)
app.include_router(cron.router)
app.include_router(alerts.router)
app.include_router(terminal.router)
