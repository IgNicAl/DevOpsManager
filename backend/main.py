import time
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.envelope import ok

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="DevOps Manager API",
    description="REST API for Ubuntu Server management — system, Docker, K8s, and more.",
    version="1.0.0",
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


# --- Router registration (imported as modules are built) ---
from routers import system, processes, services, docker_manager, logs, storage, kubernetes, gitops, backups, network  # noqa: E402

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
