import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getGitOpsApps, syncGitOpsApp } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function GitOps() {
  const fetchApps = useCallback(() => getGitOpsApps(), []);
  const { data: apps, refetch } = usePolling(fetchApps, 15000);
  const [syncTarget, setSyncTarget] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!syncTarget) return;
    setSyncing(true);
    try { await syncGitOpsApp(syncTarget); await refetch(); } catch {}
    setSyncing(false);
    setSyncTarget(null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">GitOps</h2>
        <p className="text-body-md text-on-surface-variant">ArgoCD application sync status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(apps ?? []).map((app: any) => (
          <div key={app.name} className="surface-card border border-outline-variant rounded p-4 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <h3 className="text-data-lg text-primary font-bold">{app.name}</h3>
              <StatusBadge status={app.sync_status || app.health_status || 'unknown'} />
            </div>
            <div className="space-y-1 text-data-md text-on-surface-variant">
              {app.project && <div>Project: <span className="text-on-surface">{app.project}</span></div>}
              {app.namespace && <div>Namespace: <span className="text-on-surface">{app.namespace}</span></div>}
              {app.repo_url && <div className="truncate">Repo: <span className="text-on-surface">{app.repo_url}</span></div>}
            </div>
            <button
              onClick={() => setSyncTarget(app.name)}
              className="mt-auto bg-primary-container text-on-primary-container text-data-md px-3 py-1.5 hover:bg-primary transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">sync</span>
              Sync
            </button>
          </div>
        ))}
        {(apps ?? []).length === 0 && (
          <div className="col-span-full text-center text-on-surface-variant py-8">No ArgoCD applications found</div>
        )}
      </div>

      <ConfirmModal open={!!syncTarget} title="Sync Application" message={`Sync "${syncTarget}" to latest?`} onConfirm={handleSync} onCancel={() => setSyncTarget(null)} loading={syncing} />
    </div>
  );
}
