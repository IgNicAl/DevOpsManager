import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getPbsJobs, getOffsiteSync } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';

export default function Backups() {
  const fetchJobs = useCallback(() => getPbsJobs(), []);
  const fetchOffsite = useCallback(() => getOffsiteSync(), []);

  const { data: jobs } = usePolling(fetchJobs, 30000);
  const { data: offsite } = usePolling(fetchOffsite, 30000);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Backups</h2>
        <p className="text-body-md text-on-surface-variant">Proxmox Backup Server jobs and offsite sync.</p>
      </div>

      {/* PBS Jobs */}
      <div className="surface-card border border-outline-variant rounded overflow-hidden flex-1">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
          <span className="text-label-xs text-on-surface-variant tracking-wider">PBS Backup Jobs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container-highest/50 border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Store / ID</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Type</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Status</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Start</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Size</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(jobs ?? []).map((job: any, i: number) => (
                <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-primary">{job.store || job.backup_id || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{job.backup_type || '--'}</td>
                  <td className="py-3 px-3"><StatusBadge status={job.status || 'unknown'} /></td>
                  <td className="py-3 px-3 text-on-surface-variant font-mono">{job.start_time || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">
                    {job.size_bytes != null && job.size_bytes > 0
                      ? `${(job.size_bytes / (1024 ** 3)).toFixed(2)} GB`
                      : '--'}
                  </td>
                </tr>
              ))}
              {(jobs ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No PBS jobs found or PBS unavailable</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Offsite Sync */}
      <div className="surface-card border border-outline-variant rounded p-4">
        <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-4 border-b border-outline-variant pb-2">Offsite Sync Status</h3>
        {offsite ? (
          <div className="space-y-2 text-data-md">
            <div className="flex justify-between"><span className="text-on-surface-variant">Last Sync</span><span className="text-on-surface">{offsite.last_sync || '--'}</span></div>
            <div className="flex justify-between"><span className="text-on-surface-variant">Status</span><StatusBadge status={offsite.status || 'unknown'} /></div>
            <div className="flex justify-between"><span className="text-on-surface-variant">Duration</span><span className="text-on-surface">{offsite.duration || '--'}</span></div>
          </div>
        ) : (
          <p className="text-on-surface-variant text-center">Offsite sync data unavailable</p>
        )}
      </div>
    </div>
  );
}
