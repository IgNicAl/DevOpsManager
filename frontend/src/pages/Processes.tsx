import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { getProcesses, getProcessHistory, killProcess } from '../services/api';
import { ConfirmPopover } from '../components/ui/InlinePopover';
import Sparkline from '../components/charts/Sparkline';
import { useToast } from '../components/ui/Toast';

type SortKey = 'cpu' | 'memory' | 'pid' | 'name';
type SortOrder = 'asc' | 'desc';

export default function Processes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const toast = useToast();

  // Keep URL in sync with the search box so links stay shareable.
  useEffect(() => {
    if (search) {
      if (searchParams.get('search') !== search) setSearchParams({ search }, { replace: true });
    } else if (searchParams.has('search')) {
      const next = new URLSearchParams(searchParams);
      next.delete('search');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const fetchProcesses = useCallback(
    () => getProcesses({ search: search || undefined, sort: sortKey, order: sortOrder }),
    [search, sortKey, sortOrder],
  );
  const { data: processes, refetch } = usePolling(fetchProcesses, 5000);

  const handleKill = async (pid: number, name: string) => {
    try {
      await killProcess(pid);
      toast.success(`Sent SIGTERM to ${name} (${pid})`);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Kill failed', msg);
    }
  };

  const onHeaderClick = (key: SortKey) => {
    if (key === sortKey) {
      setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const list = (processes ?? []).slice(0, 200);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">Processes</h2>
          <p className="text-body-md text-on-surface-variant">
            Running system processes. Total: {(processes ?? []).length}
          </p>
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
                <SortHeader currentKey={sortKey} order={sortOrder} k="pid" label="PID" onClick={onHeaderClick} className="w-20" />
                <SortHeader currentKey={sortKey} order={sortOrder} k="name" label="Name" onClick={onHeaderClick} />
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">User</th>
                <SortHeader currentKey={sortKey} order={sortOrder} k="cpu" label="CPU %" onClick={onHeaderClick} className="w-24" />
                <SortHeader currentKey={sortKey} order={sortOrder} k="memory" label="MEM %" onClick={onHeaderClick} className="w-24" />
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider w-32">History</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider w-20 text-right">Kill</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
              {list.map((p: any) => (
                <ProcessRow key={p.pid} process={p} onKill={() => handleKill(p.pid, p.name)} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-surface-container-highest border-t border-outline-variant py-2 px-4 text-on-surface-variant text-data-md">
          Showing {list.length} of {(processes ?? []).length} processes
        </div>
      </div>

    </div>
  );
}

function SortHeader({
  currentKey, order, k, label, onClick, className,
}: { currentKey: SortKey; order: SortOrder; k: SortKey; label: string; onClick: (k: SortKey) => void; className?: string }) {
  const active = k === currentKey;
  return (
    <th
      onClick={() => onClick(k)}
      className={`py-2 px-3 text-label-xs text-on-surface-variant tracking-wider cursor-pointer select-none hover:text-on-surface ${className || ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="material-symbols-outlined text-[14px] text-primary">
            {order === 'desc' ? 'arrow_drop_down' : 'arrow_drop_up'}
          </span>
        )}
      </span>
    </th>
  );
}

function ProcessRow({ process: p, onKill }: { process: any; onKill: () => void }) {
  const [history, setHistory] = useState<number[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await getProcessHistory(p.pid);
        if (cancelled || !res.data.success || !res.data.data) return;
        setHistory(res.data.data.cpu.map((s: any) => s.v));
      } catch { /* ignore */ }
    };
    tick();
    const handle = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [p.pid]);

  return (
    <tr className="hover:bg-surface-container-highest/50 transition-colors group">
      <td className="py-2 px-3 font-mono text-outline">{p.pid}</td>
      <td className="py-2 px-3 font-bold text-primary">{p.name}</td>
      <td className="py-2 px-3 text-on-surface-variant">{p.username || '--'}</td>
      <td className="py-2 px-3">
        <span className={p.cpu_percent > 50 ? 'text-error' : p.cpu_percent > 20 ? 'text-tertiary-container' : 'text-on-surface-variant'}>
          {Number(p.cpu_percent ?? 0).toFixed(1)}
        </span>
      </td>
      <td className="py-2 px-3">
        <span className={p.memory_percent > 50 ? 'text-error' : p.memory_percent > 20 ? 'text-tertiary-container' : 'text-on-surface-variant'}>
          {Number(p.memory_percent ?? 0).toFixed(1)}
        </span>
      </td>
      <td className="py-2 px-3">
        <Sparkline values={history} yMax={100} />
      </td>
      <td className="py-2 px-3 text-right">
        <button
          ref={btnRef}
          onClick={() => setConfirm(true)}
          className="p-1 text-on-surface-variant hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        <ConfirmPopover
          open={confirm}
          anchorRef={btnRef}
          message={`Kill ${p.name} (${p.pid})?`}
          confirmLabel="Kill"
          onCancel={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); onKill(); }}
        />
      </td>
    </tr>
  );
}
