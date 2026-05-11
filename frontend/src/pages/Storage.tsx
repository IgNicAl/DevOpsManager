import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import {
  getStorageDisks,
  getStorageSmart,
  getStorageDu,
  getZfsPools,
  getKubernetesPvcs,
  getSystemDisk,
} from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';
import Modal from '../components/ui/Modal';

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  return `${(bytes / (1024 ** 4)).toFixed(2)} TB`;
}

export default function Storage() {
  const fetchDisk = useCallback(() => getSystemDisk(), []);
  const fetchDisks = useCallback(() => getStorageDisks(), []);
  const fetchZfs = useCallback(() => getZfsPools(), []);
  const fetchPvcs = useCallback(() => getKubernetesPvcs(), []);

  const { data: mounts } = usePolling(fetchDisk, 15000);
  const { data: blockDevices } = usePolling(fetchDisks, 30000);
  const { data: pools } = usePolling(fetchZfs, 30000);
  const { data: pvcs } = usePolling(fetchPvcs, 30000);

  // Mount list (from /api/system/disk — partition-level) + helpers preserved
  // from local stash for picking the root partition explicitly.
  const diskList = Array.isArray(mounts) ? mounts : [];
  const rootDisk = diskList.find((d: any) => d.mountpoint === '/') ?? diskList[0];

  // SMART modal state
  const [smartDevice, setSmartDevice] = useState<string | null>(null);
  const [smartData, setSmartData] = useState<any>(null);
  const [smartLoading, setSmartLoading] = useState(false);

  const openSmart = async (device: string) => {
    setSmartDevice(device);
    setSmartData(null);
    setSmartLoading(true);
    try {
      const res = await getStorageSmart(device);
      setSmartData(res.data.success ? res.data.data : { error: res.data.error });
    } catch (err: any) {
      setSmartData({ error: err.message });
    }
    setSmartLoading(false);
  };

  // du tool
  const [duPaths, setDuPaths] = useState('/var/log,/home');
  const [duRows, setDuRows] = useState<Array<{ path: string; size: string | null; ok: boolean; error?: string }> | null>(null);
  const [duLoading, setDuLoading] = useState(false);

  const runDu = async () => {
    const paths = duPaths.split(',').map((p) => p.trim()).filter(Boolean);
    if (paths.length === 0) return;
    setDuLoading(true);
    try {
      const res = await getStorageDu(paths);
      setDuRows(res.data.data ?? []);
    } catch (err) {
      console.error(err);
    }
    setDuLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Storage</h2>
        <p className="text-body-md text-on-surface-variant">Disks, partitions, S.M.A.R.T., ZFS pools, PVCs.</p>
      </div>

      {/* Root disk summary */}
      {rootDisk && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Root Total" value={(rootDisk.total_gb / 1024).toFixed(1)} unit="TB" icon="hard_drive" />
          <StatCard label="Root Used" value={(rootDisk.used_gb / 1024).toFixed(1)} unit="TB" icon="pie_chart" percent={rootDisk.percent} color={rootDisk.percent > 85 ? 'error' : 'primary'} />
          <StatCard label="Root Free" value={(rootDisk.free_gb / 1024).toFixed(1)} unit="TB" icon="folder_open" />
        </div>
      )}

      {/* Block devices (lsblk tree) */}
      <div className="surface-card border border-outline-variant rounded p-4">
        <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-4 border-b border-outline-variant pb-2">Disks &amp; Partitions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Type</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Size</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">FS</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Mountpoint</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Used</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Model</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {flattenDevices(blockDevices ?? []).map(({ d, depth }) => (
                <DeviceRow key={(d.path || d.name) + ':' + depth} d={d} depth={depth} openSmart={openSmart} />
              ))}
              {(blockDevices ?? []).length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-on-surface-variant">No devices found or lsblk unavailable</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* du tool */}
      <div className="surface-card border border-outline-variant rounded p-4">
        <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-4 border-b border-outline-variant pb-2">Directory sizes (du -sh)</h3>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 bg-surface-container-low border border-outline-variant text-on-surface text-data-md py-1.5 px-3 terminal-focus"
            placeholder="/var/log,/home,/opt"
            value={duPaths}
            onChange={(e) => setDuPaths(e.target.value)}
            disabled={duLoading}
          />
          <button
            onClick={runDu}
            disabled={duLoading || !duPaths}
            className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
          >
            {duLoading ? 'Running…' : 'Measure'}
          </button>
        </div>
        {duRows && (
          <table className="w-full text-data-md">
            <thead>
              <tr>
                <th className="text-left text-label-xs text-on-surface-variant py-1">Path</th>
                <th className="text-left text-label-xs text-on-surface-variant py-1">Size</th>
                <th className="text-left text-label-xs text-on-surface-variant py-1">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {duRows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1.5 font-mono text-primary">{r.path}</td>
                  <td className="py-1.5 text-on-surface">{r.size || '--'}</td>
                  <td className="py-1.5 text-on-surface-variant">{r.ok ? 'ok' : (r.error || 'error')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ZFS Pools */}
      <div className="surface-card border border-outline-variant rounded p-4">
        <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-4 border-b border-outline-variant pb-2">ZFS Pools</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Pool</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Health</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Size</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Allocated</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Free</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(pools ?? []).map((p: any) => (
                <tr key={p.name} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-primary">{p.name}</td>
                  <td className="py-3 px-3"><StatusBadge status={p.health || 'unknown'} /></td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.size || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.allocated || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.free || '--'}</td>
                </tr>
              ))}
              {(pools ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No ZFS pools found or zpool not available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* K8s PVCs */}
      <div className="surface-card border border-outline-variant rounded p-4">
        <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-4 border-b border-outline-variant pb-2">Kubernetes PVCs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Status</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Capacity</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Namespace</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(pvcs ?? []).map((pvc: any, i: number) => (
                <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-primary">{pvc.name}</td>
                  <td className="py-3 px-3"><StatusBadge status={pvc.status || 'unknown'} /></td>
                  <td className="py-3 px-3 text-on-surface-variant">{pvc.capacity || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{pvc.namespace || '--'}</td>
                </tr>
              ))}
              {(pvcs ?? []).length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-on-surface-variant">No PVCs found or kubectl not available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!smartDevice}
        title={`S.M.A.R.T. — /dev/${smartDevice}`}
        onClose={() => { setSmartDevice(null); setSmartData(null); }}
        size="xl"
      >
        {smartLoading && <div className="text-on-surface-variant">Loading…</div>}
        {!smartLoading && smartData?.error && (
          <div className="text-error text-data-md">{smartData.error}</div>
        )}
        {!smartLoading && smartData && !smartData.error && (
          <pre className="font-mono text-data-md text-on-surface-variant whitespace-pre-wrap break-all">
            {JSON.stringify(smartData, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  );
}

function flattenDevices(devices: any[], depth = 0, out: Array<{ d: any; depth: number }> = []): Array<{ d: any; depth: number }> {
  for (const d of devices) {
    out.push({ d, depth });
    if (d.children?.length) flattenDevices(d.children, depth + 1, out);
  }
  return out;
}

function DeviceRow({ d, depth, openSmart }: { d: any; depth: number; openSmart: (device: string) => void }) {
  const indent = depth > 0 ? '└─ '.padStart(depth * 2 + 3, ' ') : '';
  const usePct = d.fs_use_percent ? parseInt(d.fs_use_percent, 10) : 0;
  const isDisk = d.type === 'disk';
  return (
    <tr className="hover:bg-surface-container-highest/50 transition-colors">
      <td className="py-2 px-3 font-mono">
        <span className="text-outline">{indent}</span>
        <span className={depth === 0 ? 'text-primary font-bold' : 'text-on-surface'}>{d.name}</span>
      </td>
      <td className="py-2 px-3 text-on-surface-variant">{d.type}</td>
      <td className="py-2 px-3 text-on-surface-variant font-mono">{formatBytes(d.size_bytes)}</td>
      <td className="py-2 px-3 text-on-surface-variant">{d.fstype || '--'}</td>
      <td className="py-2 px-3 text-on-surface-variant font-mono">{d.mountpoint || '--'}</td>
      <td className="py-2 px-3 text-on-surface-variant">
        {d.fs_used_bytes != null ? (
          <div className="flex items-center gap-2">
            <div className="w-24 progress-track">
              <div
                className={`h-full ${usePct > 85 ? 'bg-error' : usePct > 70 ? 'bg-tertiary-container' : 'bg-primary'}`}
                style={{ width: `${usePct}%` }}
              />
            </div>
            <span>{d.fs_use_percent || ''}</span>
          </div>
        ) : '--'}
      </td>
      <td className="py-2 px-3 text-on-surface-variant truncate max-w-[200px]">{d.model || '--'}</td>
      <td className="py-2 px-3 text-right">
        {isDisk && (
          <button
            onClick={() => openSmart(d.name)}
            className="px-2 py-1 text-label-xs text-on-surface-variant border border-outline-variant hover:text-primary hover:border-primary"
            title="S.M.A.R.T. info"
          >
            SMART
          </button>
        )}
      </td>
    </tr>
  );
}
