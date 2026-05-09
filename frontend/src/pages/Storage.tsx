import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getZfsPools, getKubernetesPvcs, getSystemDisk } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';

export default function Storage() {
  const fetchDisk = useCallback(() => getSystemDisk(), []);
  const fetchZfs = useCallback(() => getZfsPools(), []);
  const fetchPvcs = useCallback(() => getKubernetesPvcs(), []);

  const { data: disks } = usePolling(fetchDisk, 15000);
  const { data: pools } = usePolling(fetchZfs, 15000);
  const { data: pvcs } = usePolling(fetchPvcs, 30000);

  const mainDisk = Array.isArray(disks) ? disks[0] : disks;

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Storage</h2>
        <p className="text-body-md text-on-surface-variant">ZFS pools, disk mounts, and Kubernetes PVCs.</p>
      </div>

      {/* Disk Overview */}
      {mainDisk && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Total" value={(mainDisk.total_gb / 1024).toFixed(1)} unit="TB" icon="hard_drive" />
          <StatCard label="Used" value={(mainDisk.used_gb / 1024).toFixed(1)} unit="TB" icon="pie_chart" percent={mainDisk.percent} color={mainDisk.percent > 85 ? 'error' : 'primary'} />
          <StatCard label="Free" value={(mainDisk.free_gb / 1024).toFixed(1)} unit="TB" icon="folder_open" />
        </div>
      )}

      {/* ZFS Pools */}
      <div className="surface-card border border-outline-variant rounded p-4">
        <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-4 border-b border-outline-variant pb-2">ZFS Pools</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Pool</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">State</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Size</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Used</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Free</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(pools ?? []).map((p: any) => (
                <tr key={p.name} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-primary">{p.name}</td>
                  <td className="py-3 px-3"><StatusBadge status={p.state || 'unknown'} /></td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.size || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.alloc || '--'}</td>
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
    </div>
  );
}
