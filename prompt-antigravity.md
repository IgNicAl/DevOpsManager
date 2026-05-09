# Prompt — Antigravity + antigravity-kit (DevOps Manager)

> Siga os passos em ordem. Cole cada bloco de código no chat do Antigravity separadamente.
> O antigravity-kit já está instalado (.agent/ no projeto).

---

## Passo 1 — Planejar o projeto com `/plan`

```
/plan

Build a DevOps Manager REST API in Python (FastAPI) that runs on localhost:8000 on an Ubuntu Server.
The API will be consumed by a React frontend running on localhost:5173.

It needs to expose endpoints to:
- Monitor system resources: CPU, RAM, disk, network, uptime (using psutil)
- List and kill running processes
- Start, stop, restart, enable, disable systemd services (using subprocess + systemctl)
- Manage Docker containers and images (using Docker SDK for Python)
- Read system logs: /var/log/syslog, journalctl, Docker container logs
- Expose ZFS pool status (using subprocess + zpool commands)
- Expose K3s/Kubernetes cluster info (nodes, pods, deployments) via kubectl subprocess calls
- Expose ArgoCD application sync status via kubectl or ArgoCD CLI
- Expose Proxmox Backup Server job status via PBS REST API
- Expose Traefik routes and TLS certificate expiry via Traefik API
- Expose Tailscale peer list via tailscale CLI
- Expose Cloudflare Tunnel status via cloudflared CLI

All responses must use a standard envelope: { success, data, error }
All destructive actions require a { confirm: true } field in the request body.
CORS must be enabled for all origins.
The app will be deployed via Docker Compose, mounting /var/run/docker.sock and /var/log.
```

> O agente vai gerar um task breakdown completo. Revise e confirme antes de prosseguir.

---

## Passo 2 — Criar a estrutura base com `/create`

```
/create

Create the base FastAPI project structure for the DevOps Manager API:

- main.py with app setup, CORS middleware, and router registration for all modules
- routers/ folder with empty files:
    system.py, processes.py, services.py, docker_manager.py, logs.py,
    storage.py, kubernetes.py, gitops.py, backups.py, network.py
- requirements.txt with: fastapi, uvicorn, psutil, docker, python-multipart, httpx
- Dockerfile (Python 3.11-slim, exposes port 8000)
- docker-compose.yml that mounts /var/run/docker.sock (rw) and /var/log (ro), exposes 127.0.0.1:8000:8000
- /health endpoint returning { status: "ok", timestamp }
- Standard response envelope as a Pydantic helper: { success: bool, data: Any, error: str | None }
```

---

## Passo 3 — Implementar os módulos (um por vez)

### 3a. Recursos do sistema

```
/create

Implement routers/system.py for the DevOps Manager API.

Endpoints:
- GET /api/system/overview — CPU%, RAM (used/total GB), disk usage on /, uptime seconds, hostname, OS name, kernel version
- GET /api/system/cpu — per-core usage list, load average (1m/5m/15m), frequency
- GET /api/system/memory — total, used, free, percent, swap total/used/free
- GET /api/system/disk — list of all partitions with mountpoint, total, used, free, percent
- GET /api/system/network — per-interface bytes_sent, bytes_recv, packets_sent, packets_recv

Use psutil. Wrap all calls in try/except. Return using the standard response envelope.
```

### 3b. Processos

```
/create

Implement routers/processes.py for the DevOps Manager API.

Endpoints:
- GET /api/processes — list all running processes: pid, name, username, cpu_percent, memory_percent, status, create_time
- GET /api/processes/{pid} — details of a specific process (same fields + cmdline, cwd if available)
- DELETE /api/processes/{pid} — kill process. Body must contain { confirm: true }. Support optional query param signal (default SIGTERM).

Use psutil. Handle NoSuchProcess and AccessDenied gracefully with the error envelope.
```

### 3c. Serviços systemd

```
/create

Implement routers/services.py for the DevOps Manager API.

Endpoints:
- GET /api/services — list all systemd services with: name, description, load_state, active_state, sub_state
- GET /api/services/{name} — status details of one service
- POST /api/services/action — body: { service: str, action: "start"|"stop"|"restart"|"enable"|"disable", confirm: true }

Use subprocess.run() with systemctl. Never use shell=True with user input.
Validate service name with regex: ^[a-zA-Z0-9@._-]+$ before passing to subprocess.
Return clear error messages if the service does not exist.
```

### 3d. Docker

```
/create

Implement routers/docker_manager.py for the DevOps Manager API.

Endpoints:
- GET /api/docker/containers — list all containers: id (short), name, image, status, ports, created
- GET /api/docker/containers/{id} — full details: env vars, mounts, network settings, resource stats
- POST /api/docker/containers/action — body: { container_id: str, action: "start"|"stop"|"restart"|"remove", confirm: true }
- GET /api/docker/containers/{id}/logs — query params: lines (default 100)
- GET /api/docker/images — list images: id (short), tags, size, created
- DELETE /api/docker/images/{id} — body: { confirm: true }

Use Docker SDK for Python (import docker). Handle docker.errors.DockerException for when Docker is not running.
If Docker is not installed or not running, return { success: false, error: "Docker is not available" } on all Docker endpoints.
```

### 3e. Logs

```
/create

Implement routers/logs.py for the DevOps Manager API.

Endpoints:
- GET /api/logs/system — query params: lines (default 100), filter (optional keyword)
  Read last N lines from /var/log/syslog
- GET /api/logs/service/{name} — query params: lines (default 100), filter
  Run: journalctl -u {name} -n {lines} --no-pager
  Validate service name with regex before passing to subprocess.
- GET /api/logs/docker/{container_id} — query params: lines (default 100), filter
  Use Docker SDK to get container logs.
- GET /api/logs/kubernetes/{namespace}/{pod} — query params: lines (default 100), container (optional), filter
  Run: kubectl logs {pod} -n {namespace} --tail={lines}
  If container param provided, add -c {container}
  Validate namespace, pod, container names with regex: ^[a-z0-9][a-z0-9\-\.]+$

For all endpoints: if filter is provided, return only lines containing the filter string (case-insensitive).
Return logs as { success: true, data: { lines: [...], total: N } }
```

### 3f. Storage (ZFS)

```
/create

Implement routers/storage.py for the DevOps Manager API.

Endpoints:
- GET /api/storage/zfs/pools — run: zpool list -H -o name,size,alloc,free,health
  Return list of pools with: name, size, alloc, free, health (ONLINE/DEGRADED/FAULTED/UNAVAIL)
- GET /api/storage/zfs/pools/{name} — run: zpool status {name}
  Parse and return: pool name, health, vdevs list with member disks and their status
- GET /api/storage/kubernetes/pvc — run: kubectl get pvc --all-namespaces -o json
  Return list of PVCs with: name, namespace, status, capacity, storageClass, volumeName, boundPod

Validate pool names with regex: ^[a-zA-Z0-9_\-]+$
Handle zpool/kubectl not found gracefully — return { success: false, error: "zpool not available" }
```

### 3g. Kubernetes

```
/create

Implement routers/kubernetes.py for the DevOps Manager API.

Endpoints:
- GET /api/kubernetes/nodes — kubectl get nodes -o json
  Return: name, status (Ready/NotReady), roles, cpu_capacity, memory_capacity, k3s_version, age
- GET /api/kubernetes/pods — kubectl get pods --all-namespaces -o json
  Return: name, namespace, status (Running/Pending/CrashLoopBackOff/Completed/etc), restarts, node, age, containers list
- GET /api/kubernetes/deployments — kubectl get deployments --all-namespaces -o json
  Return: name, namespace, desired, ready, available, images list, age
- GET /api/kubernetes/pods/{namespace}/{pod}/events — kubectl get events -n {namespace} --field-selector involvedObject.name={pod}
  Return list of events with: type (Warning/Normal), reason, message, timestamp

Validate namespace and pod names with regex: ^[a-z0-9][a-z0-9\-\.]+$
Handle kubectl not found gracefully.
```

### 3h. GitOps (ArgoCD)

```
/create

Implement routers/gitops.py for the DevOps Manager API.

Endpoints:
- GET /api/gitops/applications — kubectl get applications --all-namespaces -o json (ArgoCD CRD)
  Return: name, namespace, syncStatus (Synced/OutOfSync/Unknown), healthStatus (Healthy/Progressing/Degraded), repoURL, targetRevision, lastSyncTime, lastCommitHash (7 chars)
- POST /api/gitops/applications/{name}/sync — body: { confirm: true }
  Run: kubectl patch application {name} -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"devops-manager"},"sync":{}}}'
- GET /api/gitops/applications/{name}/diff — kubectl diff on the application resources
  Return: { diff: "string with unified diff output" }

Handle ArgoCD not installed gracefully (CRD not found).
```

### 3i. Backups (PBS)

```
/create

Implement routers/backups.py for the DevOps Manager API.

Endpoints:
- GET /api/backups/pbs/jobs — query the Proxmox Backup Server REST API
  PBS API base URL from env var PBS_API_URL (default: https://localhost:8007)
  PBS API token from env var PBS_API_TOKEN
  Endpoint: GET /api2/json/admin/datastore/{datastore}/snapshots
  Return: list of jobs with vmid, name, backup_time, size, verify_state
- GET /api/backups/pbs/summary — return last successful backup time, next scheduled, total stored size
- GET /api/backups/offsite — read from a config file at /etc/devops-manager/offsite-sync.json
  Config format: [{ "name": "Backblaze B2", "last_sync": "ISO timestamp", "status": "ok|failed", "files": N, "size_bytes": N }]
  If config file doesn't exist, return empty list with a note.

Use httpx for PBS API calls. Disable SSL verification for self-signed certs (verify=False).
Handle PBS not reachable gracefully.
```

### 3j. Network (Traefik + Tailscale + Cloudflare)

```
/create

Implement routers/network.py for the DevOps Manager API.

Endpoints:
- GET /api/network/traefik/routes — query Traefik API at http://localhost:8080/api/http/routers
  Return: name, rule (domain), service, entrypoints, tls status
- GET /api/network/certificates — parse Traefik ACME JSON file at path from env var TRAEFIK_ACME_PATH
  Default: /etc/traefik/acme.json
  Return: list of { domain, issuer, expiry_date, days_remaining }
- GET /api/network/tailscale/peers — run: tailscale status --json
  Return: list of peers with name, ip, os, last_seen, online (bool)
- GET /api/network/cloudflare/tunnels — run: cloudflared tunnel list --output json
  Return: list of tunnels with id, name, status, hostname

Handle each tool not being installed gracefully with a specific error message per tool.
Validate ACME JSON path — only allow paths under /etc/traefik/ or /opt/traefik/
```

---

## Passo 4 — Auditoria de segurança com `/enhance`

```
/enhance

Review all routers for security issues, specifically:
1. Any place where user input is passed to shell commands — confirm all use allowlist regex validation
2. Any use of shell=True in subprocess calls — replace with list-style args
3. Missing try/except around psutil calls that can raise AccessDenied or NoSuchProcess
4. Docker container IDs and image IDs used in SDK calls — validate format before use
5. Any endpoint missing the { confirm: true } check for destructive operations
6. Path traversal risks in any file-reading endpoints (ACME JSON, offsite config)
7. PBS API token being logged or exposed in error messages

Fix all issues found.
```

---

## Passo 5 — Testes com `/test`

```
/test

Generate pytest tests for the DevOps Manager API covering:
- GET /health returns 200 with { status: "ok" }
- GET /api/system/overview returns valid structure
- POST /api/services/action with missing confirm field returns error
- DELETE /api/processes/{pid} with confirm: false returns error
- GET /api/docker/containers handles Docker not running gracefully
- GET /api/storage/zfs/pools handles zpool not installed gracefully
- GET /api/kubernetes/nodes handles kubectl not installed gracefully
- GET /api/network/traefik/routes handles Traefik not running gracefully

Mock psutil, docker SDK, subprocess, and httpx calls where needed.
```

---

## Passo 6 — Integração com o frontend com `/create`

```
/create

Convert all 16 HTML files in stitch-screens/code/ into a complete React + Vite + TypeScript frontend application. Use the PNG screenshots in stitch-screens/images/ as visual reference to ensure fidelity.

Tech stack: React 18, Vite, TypeScript, Tailwind CSS, React Router v6, axios.

Rules:
- Extract shared styles from the HTMLs into a Tailwind theme (tailwind.config.ts): colors, fonts, spacing
- Each HTML becomes one page component in src/pages/. Modal/expanded variants (files 03, 05, 09, 13, 14, 15) are not separate routes — merge them as modal/expanded states into their base page
- Create src/services/api.ts with one typed async function per backend endpoint (base URL from VITE_API_BASE_URL env var, fallback http://localhost:8000)
- Create src/hooks/usePolling.ts for the Overview 5s refresh
- Create shared components in src/components/ui/: StatusBadge, StatCard, TerminalViewer, ConfirmModal, Sidebar
- Sidebar shows red count badges: Kubernetes (CrashLoopBackOff pods), GitOps (OutOfSync apps)
- Sidebar shows pulsing green dot on Overview when GET /health is reachable
- All API responses follow { success: boolean, data: T, error: string | null }
- Add a Dockerfile (node:20-alpine build → nginx:alpine serve)

Page mapping:
- 01 + 05 → src/pages/Overview.tsx
- 02 → src/pages/Storage.tsx
- 04 + 03 → src/pages/GitOps.tsx (03 is the diff modal state)
- 11 → src/pages/Services.tsx
- 16 + 09 → src/pages/Kubernetes.tsx (09 is the pod logs expanded state)
- 10 → src/pages/Docker.tsx
- 06 → src/pages/Processes.tsx
- 08 + 13 → src/pages/Backups.tsx (13 is the timeline expanded state)
- 07 + 14 → src/pages/Network.tsx (14 is the urgent certificates state)
- 12 + 15 → src/pages/Logs.tsx (15 is the K8s container logs state)
```

---

## Passo 7 — Deploy completo com `/deploy`

```
/deploy

Create a docker-compose.yml that runs both backend and frontend together:
- backend: FastAPI on 127.0.0.1:8000, mounts /var/run/docker.sock and /var/log
- frontend: nginx serving the React build on 127.0.0.1:5173
- Both on the same Docker network (devops-net)
- Frontend env: VITE_API_BASE_URL=http://localhost:8000

Then start both services and verify:
- GET http://localhost:8000/health returns { status: "ok" }
- Frontend loads at http://localhost:5173
- Overview screen fetches real data from the backend
- No CORS errors in the browser console

Also provide the systemd unit file to run docker-compose up automatically on server boot.
```

---

## Referência rápida dos slash commands

| Comando | Quando usar |
|---|---|
| `/plan` | Antes de tudo — gera o task breakdown |
| `/create` | Para implementar cada módulo |
| `/enhance` | Para melhorar e auditar código existente |
| `/debug` | Se algo quebrar durante a implementação |
| `/test` | Para gerar testes automatizados |
| `/deploy` | Para configurar e subir o ambiente |
| `/status` | Para checar o progresso geral do projeto |
