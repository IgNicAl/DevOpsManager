import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

export const apiBase = () => API_BASE;

// ============================================================
// System
// ============================================================
export const getHealth = () => api.get<ApiResponse<{ status: string; timestamp: number }>>('/health');
export const getSystemOverview = () => api.get<ApiResponse<any>>('/api/system/overview');
export const getSystemCpu = () => api.get<ApiResponse<any>>('/api/system/cpu');
export const getSystemMemory = () => api.get<ApiResponse<any>>('/api/system/memory');
export const getSystemDisk = () => api.get<ApiResponse<any>>('/api/system/disk');
export const getSystemNetwork = () => api.get<ApiResponse<any>>('/api/system/network');

export interface MetricSample { t: number; v: number }
export interface SystemHistory { cpu: MetricSample[]; ram: MetricSample[] }
export const getSystemHistory = () => api.get<ApiResponse<SystemHistory>>('/api/system/history');
export const getSystemTemperature = () => api.get<ApiResponse<Record<string, Array<{ label: string; current: number; high?: number; critical?: number }>>>>('/api/system/temperature');
export const getTopProcesses = (by: 'cpu' | 'memory' = 'cpu', limit = 5) =>
  api.get<ApiResponse<any[]>>('/api/system/top-processes', { params: { by, limit } });
export const getSystemLoad = () =>
  api.get<ApiResponse<{ high_load: boolean; samples_in_window: number; now: string }>>('/api/system/load');

// ============================================================
// Processes
// ============================================================
export const getProcesses = (params?: { search?: string; sort?: 'cpu' | 'memory' | 'pid' | 'name'; order?: 'asc' | 'desc' }) =>
  api.get<ApiResponse<any[]>>('/api/processes', { params });
export const getProcess = (pid: number) => api.get<ApiResponse<any>>(`/api/processes/${pid}`);
export const getProcessHistory = (pid: number) =>
  api.get<ApiResponse<{ pid: number; cpu: MetricSample[]; memory: MetricSample[] }>>(`/api/processes/${pid}/history`);
export const killProcess = (pid: number, signal = 'SIGTERM') =>
  api.delete<ApiResponse<any>>(`/api/processes/${pid}`, { data: { confirm: true, signal } });

// ============================================================
// Services
// ============================================================
export const getServices = (state: 'all' | 'running' | 'failed' | 'inactive' = 'all') =>
  api.get<ApiResponse<any[]>>('/api/services', { params: { state } });
export const getService = (name: string) => api.get<ApiResponse<any>>(`/api/services/${name}`);
export const serviceAction = (service: string, action: string) =>
  api.post<ApiResponse<any>>('/api/services/action', { service, action, confirm: true });

// ============================================================
// Docker
// ============================================================
export const getDockerContainers = () => api.get<ApiResponse<any[]>>('/api/docker/containers');
export const getDockerContainer = (id: string) => api.get<ApiResponse<any>>(`/api/docker/containers/${id}`);
export const inspectDockerContainer = (id: string) => api.get<ApiResponse<any>>(`/api/docker/containers/${id}/inspect`);
export const getDockerContainerStats = (id: string) =>
  api.get<ApiResponse<{ cpu_percent: number; mem_used_mb: number; mem_limit_mb: number; mem_percent: number; net_rx_b: number; net_tx_b: number }>>(
    `/api/docker/containers/${id}/stats`,
  );
export const dockerContainerAction = (containerId: string, action: string) =>
  api.post<ApiResponse<any>>('/api/docker/containers/action', { container_id: containerId, action, confirm: true });
export const renameDockerContainer = (id: string, name: string) =>
  api.post<ApiResponse<{ id: string; name: string }>>(`/api/docker/containers/${id}/rename`, { name });
export const connectContainerToNetwork = (networkName: string, containerId: string) =>
  api.post<ApiResponse<any>>(`/api/docker/networks/${networkName}/connect`, { container_id: containerId });
export const disconnectContainerFromNetwork = (networkName: string, containerId: string) =>
  api.delete<ApiResponse<any>>(`/api/docker/networks/${networkName}/disconnect/${containerId}`);
export interface CreateContainerInput {
  image: string;
  name?: string;
  ports?: string[];
  volumes?: string[];
  env?: Record<string, string>;
  restart_policy?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
  command?: string;
}
export const createDockerContainer = (input: CreateContainerInput) =>
  api.post<ApiResponse<{ id: string; name: string }>>('/api/docker/containers', input);
export const getDockerContainerLogs = (id: string, lines = 100) =>
  api.get<ApiResponse<any>>(`/api/docker/containers/${id}/logs`, { params: { lines } });
export const getDockerImages = () => api.get<ApiResponse<any[]>>('/api/docker/images');
export const deleteDockerImage = (id: string) =>
  api.delete<ApiResponse<any>>(`/api/docker/images/${id}`, { data: { confirm: true } });
export const dockerPullImageUrl = (image: string) =>
  `${API_BASE}/api/docker/images/pull?image=${encodeURIComponent(image)}`;

export const getDockerNetworks = () => api.get<ApiResponse<any[]>>('/api/docker/networks');
export const createDockerNetwork = (input: { name: string; driver?: string; subnet?: string }) =>
  api.post<ApiResponse<any>>('/api/docker/networks', input);
export const deleteDockerNetwork = (name: string) =>
  api.delete<ApiResponse<any>>(`/api/docker/networks/${name}`, { data: { confirm: true } });

export const getDockerVolumes = () => api.get<ApiResponse<any[]>>('/api/docker/volumes');
export const inspectDockerVolume = (name: string) => api.get<ApiResponse<any>>(`/api/docker/volumes/${name}/inspect`);
export const deleteDockerVolume = (name: string) =>
  api.delete<ApiResponse<any>>(`/api/docker/volumes/${name}`, { data: { confirm: true } });

// ============================================================
// Logs
// ============================================================
export const getSystemLogs = (lines = 100, filter?: string, level?: string) =>
  api.get<ApiResponse<any>>('/api/logs/system', { params: { lines, filter, level } });
export const getServiceLogs = (name: string, lines = 100, filter?: string, level?: string) =>
  api.get<ApiResponse<any>>(`/api/logs/service/${name}`, { params: { lines, filter, level } });
export const getDockerLogs = (containerId: string, lines = 100, filter?: string, level?: string) =>
  api.get<ApiResponse<any>>(`/api/logs/docker/${containerId}`, { params: { lines, filter, level } });
export const getKubernetesLogs = (namespace: string, pod: string, lines = 100, container?: string, filter?: string, level?: string) =>
  api.get<ApiResponse<any>>(`/api/logs/kubernetes/${namespace}/${pod}`, { params: { lines, container, filter, level } });

export const logsExportSystemUrl = (lines = 1000, filter?: string, level?: string) => {
  const params = new URLSearchParams();
  params.set('lines', String(lines));
  if (filter) params.set('filter', filter);
  if (level && level !== 'ALL') params.set('level', level);
  return `${API_BASE}/api/logs/system/export?${params.toString()}`;
};
export const logsExportServiceUrl = (name: string, lines = 1000, filter?: string, level?: string) => {
  const params = new URLSearchParams();
  params.set('lines', String(lines));
  if (filter) params.set('filter', filter);
  if (level && level !== 'ALL') params.set('level', level);
  return `${API_BASE}/api/logs/service/${encodeURIComponent(name)}/export?${params.toString()}`;
};
export const logsExportDockerUrl = (id: string, lines = 1000, filter?: string, level?: string) => {
  const params = new URLSearchParams();
  params.set('lines', String(lines));
  if (filter) params.set('filter', filter);
  if (level && level !== 'ALL') params.set('level', level);
  return `${API_BASE}/api/logs/docker/${encodeURIComponent(id)}/export?${params.toString()}`;
};

// ============================================================
// Storage
// ============================================================
export const getStorageDisks = () => api.get<ApiResponse<any[]>>('/api/storage/disks');
export const getStorageSmart = (device: string) =>
  api.get<ApiResponse<any>>(`/api/storage/disks/${device}/smart`);
export const getStorageDu = (paths: string[]) =>
  api.get<ApiResponse<Array<{ path: string; size: string | null; ok: boolean; error?: string }>>>('/api/storage/du', {
    params: { paths: paths.join(',') },
  });
export const getZfsPools = () => api.get<ApiResponse<any[]>>('/api/storage/zfs/pools');
export const getZfsPool = (name: string) => api.get<ApiResponse<any>>(`/api/storage/zfs/pools/${name}`);
export const getKubernetesPvcs = () => api.get<ApiResponse<any[]>>('/api/storage/kubernetes/pvc');

// ============================================================
// Kubernetes
// ============================================================
export const getKubernetesNodes = () => api.get<ApiResponse<any[]>>('/api/kubernetes/nodes');
export const getKubernetesPods = () => api.get<ApiResponse<any[]>>('/api/kubernetes/pods');
export const getKubernetesDeployments = () => api.get<ApiResponse<any[]>>('/api/kubernetes/deployments');
export const getPodEvents = (namespace: string, pod: string) =>
  api.get<ApiResponse<any[]>>(`/api/kubernetes/pods/${namespace}/${pod}/events`);

// ============================================================
// GitOps
// ============================================================
export const getGitOpsApps = () => api.get<ApiResponse<any[]>>('/api/gitops/applications');
export const syncGitOpsApp = (name: string) =>
  api.post<ApiResponse<any>>(`/api/gitops/applications/${name}/sync`, { confirm: true });
export const getGitOpsAppDiff = (name: string) =>
  api.get<ApiResponse<any>>(`/api/gitops/applications/${name}/diff`);

// ============================================================
// Backups
// ============================================================
export const getPbsJobs = () => api.get<ApiResponse<any[]>>('/api/backups/pbs/jobs');
export const getPbsSummary = () => api.get<ApiResponse<any>>('/api/backups/pbs/summary');
export const getOffsiteSync = () => api.get<ApiResponse<any>>('/api/backups/offsite');

// ============================================================
// Network
// ============================================================
export interface NetInterface {
  name: string;
  mac: string | null;
  ipv4: string[];
  ipv6: string[];
  is_up: boolean;
  speed_mbps: number;
  mtu: number;
  duplex: string;
}
export const getNetworkInterfaces = () => api.get<ApiResponse<NetInterface[]>>('/api/network/interfaces');
export const getNetworkRoutes = () => api.get<ApiResponse<any[]>>('/api/network/routes');
export const getNetworkConnections = () =>
  api.get<ApiResponse<Array<{ proto: string; state: string; local_address: string; remote_address: string; process: { name: string; pid: number } | null }>>>('/api/network/connections');
export const getNetworkVlans = () =>
  api.get<ApiResponse<Array<{ name: string; parent: string; vlan_id: number; operstate: string; address: string; mtu: number }>>>('/api/network/vlans');
export const createVlan = (parent: string, vlan_id: number, name?: string) =>
  api.post<ApiResponse<any>>('/api/network/vlans', { parent, vlan_id, name, confirm: true });
export const deleteVlan = (name: string) =>
  api.delete<ApiResponse<any>>(`/api/network/vlans/${name}`, { data: { confirm: true } });

export interface VlanMember {
  id: string;
  name: string;
  vlan: string;
  ip: string;
  mac: string;
  note: string;
}
export const getVlanMembers = () => api.get<ApiResponse<VlanMember[]>>('/api/network/vlan-members');
export const addVlanMember = (input: { name: string; vlan: string; ip?: string; mac?: string; note?: string }) =>
  api.post<ApiResponse<VlanMember>>('/api/network/vlan-members', input);
export const updateVlanMember = (id: string, fields: Partial<Omit<VlanMember, 'id'>>) =>
  api.put<ApiResponse<VlanMember>>(`/api/network/vlan-members/${id}`, fields);
export const deleteVlanMember = (id: string) =>
  api.delete<ApiResponse<any>>(`/api/network/vlan-members/${id}`);
export const networkPingUrl = () => `${API_BASE}/api/network/ping`;
export const networkTracerouteUrl = () => `${API_BASE}/api/network/traceroute`;

export const getTailscalePeers = () => api.get<ApiResponse<any[]>>('/api/network/tailscale/peers');
export const getCloudflareTunnels = () => api.get<ApiResponse<any[]>>('/api/network/cloudflare/tunnels');

// ============================================================
// DNS / Domains
// ============================================================
export interface HostsEntry {
  line_no: number;
  ip: string;
  hostnames: string[];
  comment: string;
}
export const getHostsEntries = () => api.get<ApiResponse<HostsEntry[]>>('/api/dns/hosts');
export const addHostsEntry = (input: { ip: string; hostnames: string[]; comment?: string }) =>
  api.post<ApiResponse<any>>('/api/dns/hosts', { ...input, confirm: true });
export const updateHostsEntry = (line_no: number, input: { ip: string; hostnames: string[]; comment?: string }) =>
  api.put<ApiResponse<any>>(`/api/dns/hosts/${line_no}`, { ...input, confirm: true });
export const deleteHostsEntry = (line_no: number) =>
  api.delete<ApiResponse<any>>(`/api/dns/hosts/${line_no}`, { data: { confirm: true } });
export const resolveDns = (name: string, type: string = 'A') =>
  api.post<ApiResponse<{ name: string; type: string; records: string[]; tool: string }>>('/api/dns/resolve', { name, type });
export const sslCheck = (host: string, port: number = 443) =>
  api.post<ApiResponse<{ host: string; port: number; not_before: string; not_after: string; days_left: number; issuer: string; subject: string; sans: string[] }>>(
    '/api/dns/ssl-check',
    { host, port },
  );
export const getTraefikRoutes = () => api.get<ApiResponse<any[]>>('/api/dns/traefik/routes');
export const getTraefikCertificates = () => api.get<ApiResponse<any[]>>('/api/dns/traefik/certificates');

// ============================================================
// Users
// ============================================================
export const getSystemUsers = () =>
  api.get<ApiResponse<Array<{ username: string; uid: number; gid: number; primary_group: string; gecos: string; home: string; shell: string; groups: string[] }>>>('/api/users');
export const getLastLogins = (limit = 20) =>
  api.get<ApiResponse<Array<{ username: string; tty: string; host: string; raw: string }>>>('/api/users/last-logins', { params: { limit } });
export const getUserSessions = () =>
  api.get<ApiResponse<Array<{ username: string; tty: string; login_at: string; host: string }>>>('/api/users/sessions');

// ============================================================
// Cron
// ============================================================
export interface CronEntry {
  index: number;
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
  command: string;
  expression: string;
  next_runs: string[];
}
export const getCron = (user: 'current' | 'root' | string = 'current') =>
  api.get<ApiResponse<{ user: string; entries: CronEntry[]; raw: string }>>('/api/cron', { params: { user } });
export interface CronInput {
  user: string;
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
  command: string;
}
export const addCronEntry = (input: CronInput) =>
  api.post<ApiResponse<any>>('/api/cron', { ...input, confirm: true });
export const updateCronEntry = (index: number, input: CronInput) =>
  api.put<ApiResponse<any>>(`/api/cron/${index}`, { ...input, confirm: true });
export const deleteCronEntry = (index: number, user: string) =>
  api.delete<ApiResponse<any>>(`/api/cron/${index}`, { data: { user, confirm: true } });
export const validateCron = (input: { minute: string; hour: string; dom: string; month: string; dow: string }) =>
  api.post<ApiResponse<{ valid: boolean; expression?: string; next_runs?: string[]; error?: string }>>('/api/cron/validate', input);

// ============================================================
// Alerts
// ============================================================
export interface AlertRule {
  id: string;
  kind: 'cpu' | 'memory' | 'disk' | 'service';
  threshold: number | null;
  target: string | null;
  label: string;
  state: 'ok' | 'firing';
  since: number | null;
}
export const getActiveAlerts = () => api.get<ApiResponse<AlertRule[]>>('/api/alerts/active');
export const getAlertHistory = (limit = 100) =>
  api.get<ApiResponse<Array<{ ts: number; rule_id: string; kind: string; label: string; target: string | null; threshold: number | null; transition: string; value: number | null }>>>(
    '/api/alerts/history',
    { params: { limit } },
  );
export const getAlertConfig = () => api.get<ApiResponse<AlertRule[]>>('/api/alerts/config');
export const replaceAlertConfig = (rules: Array<Partial<AlertRule>>) =>
  api.put<ApiResponse<AlertRule[]>>('/api/alerts/config', { rules });
export const addAlertRule = (rule: Partial<AlertRule>) =>
  api.post<ApiResponse<AlertRule>>('/api/alerts/config', rule);
export const deleteAlertRule = (id: string) => api.delete<ApiResponse<any>>(`/api/alerts/config/${id}`);

// ============================================================
// Terminal
// ============================================================
export const getTerminalStatus = () =>
  api.get<ApiResponse<{ available: boolean; token_required: boolean }>>('/api/terminal/status');
export const getTerminalHistory = (limit = 100) =>
  api.get<ApiResponse<Array<{ ts: number; session: string; event: string; bytes_in?: number; bytes_out?: number }>>>('/api/terminal/history', { params: { limit } });

export default api;
