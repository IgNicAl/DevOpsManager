import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// System
export const getHealth = () => api.get<ApiResponse<{ status: string; timestamp: number }>>('/health');
export const getSystemOverview = () => api.get<ApiResponse<any>>('/api/system/overview');
export const getSystemCpu = () => api.get<ApiResponse<any>>('/api/system/cpu');
export const getSystemMemory = () => api.get<ApiResponse<any>>('/api/system/memory');
export const getSystemDisk = () => api.get<ApiResponse<any>>('/api/system/disk');
export const getSystemNetwork = () => api.get<ApiResponse<any>>('/api/system/network');

// Processes
export const getProcesses = () => api.get<ApiResponse<any[]>>('/api/processes');
export const getProcess = (pid: number) => api.get<ApiResponse<any>>(`/api/processes/${pid}`);
export const killProcess = (pid: number, signal = 'SIGTERM') =>
  api.delete<ApiResponse<any>>(`/api/processes/${pid}`, { data: { confirm: true, signal } });

// Services
export const getServices = () => api.get<ApiResponse<any[]>>('/api/services');
export const getService = (name: string) => api.get<ApiResponse<any>>(`/api/services/${name}`);
export const serviceAction = (service: string, action: string) =>
  api.post<ApiResponse<any>>('/api/services/action', { service, action, confirm: true });

// Docker
export const getDockerContainers = () => api.get<ApiResponse<any[]>>('/api/docker/containers');
export const getDockerContainer = (id: string) => api.get<ApiResponse<any>>(`/api/docker/containers/${id}`);
export const dockerContainerAction = (containerId: string, action: string) =>
  api.post<ApiResponse<any>>('/api/docker/containers/action', { container_id: containerId, action, confirm: true });
export const getDockerContainerLogs = (id: string, lines = 100) =>
  api.get<ApiResponse<any>>(`/api/docker/containers/${id}/logs`, { params: { lines } });
export const getDockerImages = () => api.get<ApiResponse<any[]>>('/api/docker/images');
export const deleteDockerImage = (id: string) =>
  api.delete<ApiResponse<any>>(`/api/docker/images/${id}`, { data: { confirm: true } });
export const getDockerNetworks = () => api.get<ApiResponse<any[]>>('/api/docker/networks');
export const getDockerVolumes  = () => api.get<ApiResponse<any[]>>('/api/docker/volumes');

// Logs
export const getSystemLogs = (lines = 100, filter?: string) =>
  api.get<ApiResponse<any>>('/api/logs/system', { params: { lines, filter } });
export const getServiceLogs = (name: string, lines = 100, filter?: string) =>
  api.get<ApiResponse<any>>(`/api/logs/service/${name}`, { params: { lines, filter } });
export const getDockerLogs = (containerId: string, lines = 100, filter?: string) =>
  api.get<ApiResponse<any>>(`/api/logs/docker/${containerId}`, { params: { lines, filter } });
export const getKubernetesLogs = (namespace: string, pod: string, lines = 100, container?: string, filter?: string) =>
  api.get<ApiResponse<any>>(`/api/logs/kubernetes/${namespace}/${pod}`, { params: { lines, container, filter } });

// Storage
export const getZfsPools = () => api.get<ApiResponse<any[]>>('/api/storage/zfs/pools');
export const getZfsPool = (name: string) => api.get<ApiResponse<any>>(`/api/storage/zfs/pools/${name}`);
export const getKubernetesPvcs = () => api.get<ApiResponse<any[]>>('/api/storage/kubernetes/pvc');

// Kubernetes
export const getKubernetesNodes = () => api.get<ApiResponse<any[]>>('/api/kubernetes/nodes');
export const getKubernetesPods = () => api.get<ApiResponse<any[]>>('/api/kubernetes/pods');
export const getKubernetesDeployments = () => api.get<ApiResponse<any[]>>('/api/kubernetes/deployments');
export const getPodEvents = (namespace: string, pod: string) =>
  api.get<ApiResponse<any[]>>(`/api/kubernetes/pods/${namespace}/${pod}/events`);

// GitOps
export const getGitOpsApps = () => api.get<ApiResponse<any[]>>('/api/gitops/applications');
export const syncGitOpsApp = (name: string) =>
  api.post<ApiResponse<any>>(`/api/gitops/applications/${name}/sync`, { confirm: true });
export const getGitOpsAppDiff = (name: string) =>
  api.get<ApiResponse<any>>(`/api/gitops/applications/${name}/diff`);

// Backups
export const getPbsJobs = () => api.get<ApiResponse<any[]>>('/api/backups/pbs/jobs');
export const getPbsSummary = () => api.get<ApiResponse<any>>('/api/backups/pbs/summary');
export const getOffsiteSync = () => api.get<ApiResponse<any>>('/api/backups/offsite');

// Network
export const getTraefikRoutes = () => api.get<ApiResponse<any[]>>('/api/network/traefik/routes');
export const getCertificates = () => api.get<ApiResponse<any[]>>('/api/network/certificates');
export const getTailscalePeers = () => api.get<ApiResponse<any[]>>('/api/network/tailscale/peers');
export const getCloudflareTunnels = () => api.get<ApiResponse<any[]>>('/api/network/cloudflare/tunnels');

export default api;
