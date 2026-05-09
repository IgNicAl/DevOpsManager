import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getProcesses, killProcess } from '../services/api';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Processes() {
  const fetchProcesses = useCallback(() => getProcesses(), []);
  const { data: processes, refetch } = usePolling(fetchProcesses, 5000);
  const [search, setSearch] = useState('');
  const [killTarget, setKillTarget] = useState<{ pid: number; name: string } | null>(null);
  const [killing, setKilling] = useState(false);

  const filtered = (processes ?? []).filter((p: any) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search)
  );

  const handleKill = async () => {
    if (!killTarget) return;
    setKilling(true);
    try { await killProcess(killTarget.pid); await refetch(); } catch {}
    setKilling(false);
    setKillTarget(null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">Processes</h2>
          <p className="text-body-md text-on-surface-variant">Running system processes. Total: {(processes ?? []).length}</p>
        </div>
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">search</span>
          <input
            className="bg-surface-container-highest border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 pl-10 pr-4 w-64 terminal-focus transition-colors placeholder:text-on-surface-variant/50"
            placeholder="Filter by name or PID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1" style={{ maxHeight: '70vh' }}>
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider w-20">PID</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">User</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider w-20">CPU %</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider w-20">MEM %</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider w-20 text-right">Kill</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
              {filtered.slice(0, 200).map((p: any) => (
                <tr key={p.pid} className="hover:bg-surface-container-highest/50 transition-colors group">
                  <td className="py-2 px-3 font-mono text-outline">{p.pid}</td>
                  <td className="py-2 px-3 font-bold text-primary">{p.name}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{p.username || '--'}</td>
                  <td className="py-2 px-3">
                    <span className={p.cpu_percent > 50 ? 'text-error' : p.cpu_percent > 20 ? 'text-tertiary-container' : 'text-on-surface-variant'}>
                      {p.cpu_percent?.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={p.memory_percent > 50 ? 'text-error' : p.memory_percent > 20 ? 'text-tertiary-container' : 'text-on-surface-variant'}>
                      {p.memory_percent?.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => setKillTarget({ pid: p.pid, name: p.name })}
                      className="p-1 text-on-surface-variant hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-surface-container-highest border-t border-outline-variant py-2 px-4 text-on-surface-variant text-data-md">
          Showing {Math.min(filtered.length, 200)} of {filtered.length} processes
        </div>
      </div>

      <ConfirmModal
        open={!!killTarget}
        title="Kill Process"
        message={`Kill process "${killTarget?.name}" (PID ${killTarget?.pid})?`}
        onConfirm={handleKill}
        onCancel={() => setKillTarget(null)}
        loading={killing}
        variant="danger"
      />
    </div>
  );
}
