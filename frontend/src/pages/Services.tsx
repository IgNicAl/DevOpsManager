import { Fragment, useCallback, useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getServices, getService, serviceAction } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import Switch from '../components/ui/Switch';
import { ConfirmPopover } from '../components/ui/InlinePopover';
import { useToast } from '../components/ui/Toast';

type Filter = 'all' | 'running' | 'failed' | 'inactive';

function formatUptime(seconds: number): string {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Services() {
  const [filter, setFilter] = useState<Filter>('all');
  const fetchServices = useCallback(() => getServices(filter), [filter]);
  const { data: services, loading, refetch } = usePolling(fetchServices, 10000);

  const [expanded, setExpanded] = useState<Record<string, string[]>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const toast = useToast();

  const toggleExpand = async (name: string) => {
    if (expanded[name]) {
      const { [name]: _omit, ...rest } = expanded;
      setExpanded(rest);
      return;
    }
    try {
      const res = await getService(name);
      if (res.data.success) {
        setExpanded((e) => ({ ...e, [name]: res.data.data?.journal_tail ?? [] }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (service: string, currentActive: boolean) => {
    const action = currentActive ? 'stop' : 'start';
    setToggling((s) => ({ ...s, [service]: true }));
    try {
      const res = await serviceAction(service, action);
      if (res.data.success) {
        toast.success(`${service} ${action === 'start' ? 'started' : 'stopped'}`);
        await refetch();
      } else {
        toast.error(`Failed to ${action} ${service}`, res.data.error || undefined);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error(`Failed to ${action} ${service}`, msg);
    }
    setToggling((s) => { const { [service]: _, ...rest } = s; return rest; });
  };

  const handleRestart = async (service: string) => {
    setToggling((s) => ({ ...s, [service]: true }));
    try {
      const res = await serviceAction(service, 'restart');
      if (res.data.success) {
        toast.success(`${service} restarted`);
        await refetch();
      } else {
        toast.error(`Failed to restart ${service}`, res.data.error || undefined);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error(`Failed to restart ${service}`, msg);
    }
    setToggling((s) => { const { [service]: _, ...rest } = s; return rest; });
  };

  const list = services ?? [];

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">System Services</h2>
          <p className="text-body-md text-on-surface-variant">Manage and monitor systemd service states.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="appearance-none bg-surface border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 pl-3 pr-8 terminal-focus cursor-pointer"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">Status: All</option>
            <option value="running">Status: Running</option>
            <option value="inactive">Status: Inactive</option>
            <option value="failed">Status: Failed</option>
          </select>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-1/4 tracking-wider">Service Name</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Description</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-32 tracking-wider">Status</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-24 tracking-wider">Uptime</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-32 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
              {loading && <tr><td colSpan={5} className="py-8 text-center text-on-surface-variant">Loading services...</td></tr>}
              {!loading && list.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-on-surface-variant">No services found</td></tr>
              )}
              {list.map((svc: any) => (
                <ServiceRow
                  key={svc.name}
                  svc={svc}
                  expanded={expanded}
                  toggling={!!toggling[svc.name]}
                  onToggleExpand={() => toggleExpand(svc.name)}
                  onSwitch={(next) => handleToggle(svc.name, !next)}
                  onRestart={() => handleRestart(svc.name)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-surface-container-highest border-t border-outline-variant py-2 px-4 flex justify-between items-center text-on-surface-variant text-data-md">
          <span>Showing {list.length} services</span>
        </div>
      </div>

    </div>
  );
}

function ServiceRow({ svc, expanded, toggling, onToggleExpand, onSwitch, onRestart }: {
  svc: any;
  expanded: Record<string, string[]>;
  toggling: boolean;
  onToggleExpand: () => void;
  onSwitch: (next: boolean) => void;
  onRestart: () => void;
}) {
  const isFailed = svc.active_state === 'failed';
  const isActive = svc.active_state === 'active';
  const isInactive = svc.active_state === 'inactive' || svc.active_state === 'dead';
  const isExpanded = !!expanded[svc.name];
  const stopBtnRef = useRef<HTMLButtonElement | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const requestSwitch = (next: boolean) => {
    if (!next && isActive) {
      setConfirmStop(true);
      return;
    }
    onSwitch(next);
  };

  return (
    <Fragment>
      <tr
        className={`hover:bg-surface-container-highest/50 transition-colors border-l-[3px] group ${
          isFailed ? 'border-error bg-error-container/5' : 'border-transparent'
        } ${isInactive ? 'opacity-70 hover:opacity-100' : ''}`}
      >
        <td className={`py-3 px-3 font-bold ${isFailed ? 'text-error' : 'text-primary'} flex items-center gap-2`}>
          <button
            onClick={onToggleExpand}
            className="text-on-surface-variant hover:text-on-surface"
            title={isExpanded ? 'Collapse' : 'Show journal'}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          <span onClick={onToggleExpand} className="cursor-pointer hover:underline">{svc.name}</span>
        </td>
        <td className="py-3 px-3 text-on-surface-variant truncate max-w-[300px]">{svc.description || '--'}</td>
        <td className="py-3 px-3"><StatusBadge status={svc.active_state || 'unknown'} /></td>
        <td className="py-3 px-3 text-on-surface-variant font-mono">{formatUptime(svc.uptime_sec || 0)}</td>
        <td className="py-3 px-3">
          <div className="flex items-center justify-end gap-3">
            <Switch
              checked={isActive}
              onChange={requestSwitch}
              loading={toggling}
              ariaLabel={`Toggle ${svc.name}`}
            />
            <button
              ref={stopBtnRef as any}
              onClick={onRestart}
              disabled={isInactive || toggling}
              className={`p-1 rounded ${isInactive ? 'opacity-30 cursor-not-allowed' : 'text-on-surface-variant hover:text-secondary'}`}
              title="Restart"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
            <ConfirmPopover
              open={confirmStop}
              anchorRef={stopBtnRef as React.RefObject<HTMLElement | null>}
              message={`Stop ${svc.name}?`}
              onCancel={() => setConfirmStop(false)}
              onConfirm={() => { setConfirmStop(false); onSwitch(false); }}
              confirmLabel="Stop"
            />
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-surface-container-low">
          <td colSpan={5} className="px-6 py-3">
            <div className="text-label-xs text-on-surface-variant mb-2">Journal (last 20 lines)</div>
            <pre className="font-mono text-data-md text-on-surface-variant bg-surface-container-lowest p-3 rounded-sm overflow-x-auto max-h-60">
              {(expanded[svc.name] || []).join('\n') || '(empty)'}
            </pre>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
