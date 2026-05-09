import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getServices, serviceAction } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Services() {
  const fetchServices = useCallback(() => getServices(), []);
  const { data: services, loading, refetch } = usePolling(fetchServices, 10000);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<{ service: string; action: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const filtered = (services ?? []).filter((s: any) => {
    if (filter === 'all') return true;
    return s.status?.toLowerCase() === filter;
  });

  const handleAction = async () => {
    if (!modal) return;
    setActionLoading(true);
    try {
      await serviceAction(modal.service, modal.action);
      await refetch();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
    setModal(null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">System Services</h2>
          <p className="text-body-md text-on-surface-variant">Manage and monitor systemd service states.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="appearance-none bg-surface border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 pl-3 pr-8 terminal-focus cursor-pointer"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Status: All</option>
            <option value="active">Status: Active</option>
            <option value="inactive">Status: Inactive</option>
            <option value="failed">Status: Failed</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-1/4 tracking-wider">Service Name</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-2/5 tracking-wider">Description</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-32 tracking-wider">Status</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant w-32 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
              {loading && (
                <tr><td colSpan={4} className="py-8 text-center text-on-surface-variant">Loading services...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-on-surface-variant">No services found</td></tr>
              )}
              {filtered.map((svc: any) => {
                const isFailed = svc.status?.toLowerCase() === 'failed';
                const isInactive = svc.status?.toLowerCase() === 'inactive';
                return (
                  <tr
                    key={svc.name}
                    className={`hover:bg-surface-container-highest/50 transition-colors border-l-[3px] group ${
                      isFailed ? 'border-error bg-error-container/5' : 'border-transparent'
                    } ${isInactive ? 'opacity-70 hover:opacity-100' : ''}`}
                  >
                    <td className={`py-3 px-3 font-bold ${isFailed ? 'text-error' : 'text-primary'} group-hover:text-primary-fixed transition-colors`}>
                      {svc.name}
                    </td>
                    <td className="py-3 px-3 text-on-surface-variant truncate max-w-[300px]">{svc.description || '--'}</td>
                    <td className="py-3 px-3"><StatusBadge status={svc.status || 'unknown'} /></td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal({ service: svc.name, action: 'start' })}
                          className="p-1 text-on-surface-variant hover:text-primary rounded"
                          title="Start"
                        >
                          <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                        </button>
                        <button
                          onClick={() => setModal({ service: svc.name, action: 'stop' })}
                          className={`p-1 rounded ${isInactive ? 'opacity-30 cursor-not-allowed' : 'text-on-surface-variant hover:text-error'}`}
                          title="Stop"
                          disabled={isInactive}
                        >
                          <span className="material-symbols-outlined text-[20px]">stop</span>
                        </button>
                        <button
                          onClick={() => setModal({ service: svc.name, action: 'restart' })}
                          className={`p-1 rounded ${isInactive ? 'opacity-30 cursor-not-allowed' : 'text-on-surface-variant hover:text-secondary'}`}
                          title="Restart"
                          disabled={isInactive}
                        >
                          <span className="material-symbols-outlined text-[20px]">refresh</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-surface-container-highest border-t border-outline-variant py-2 px-4 flex justify-between items-center text-on-surface-variant text-data-md">
          <span>Showing {filtered.length} services</span>
        </div>
      </div>

      <ConfirmModal
        open={!!modal}
        title={`${modal?.action?.toUpperCase()} Service`}
        message={`Are you sure you want to ${modal?.action} "${modal?.service}"?`}
        onConfirm={handleAction}
        onCancel={() => setModal(null)}
        loading={actionLoading}
        variant={modal?.action === 'stop' ? 'danger' : 'default'}
      />
    </div>
  );
}
