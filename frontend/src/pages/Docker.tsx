import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getDockerContainers, getDockerImages, dockerContainerAction } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Docker() {
  const fetchContainers = useCallback(() => getDockerContainers(), []);
  const fetchImages = useCallback(() => getDockerImages(), []);
  const { data: containers, refetch: refetchContainers } = usePolling(fetchContainers, 10000);
  const { data: images } = usePolling(fetchImages, 30000);
  const [tab, setTab] = useState<'containers' | 'images'>('containers');
  const [modal, setModal] = useState<{ id: string; action: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async () => {
    if (!modal) return;
    setActionLoading(true);
    try {
      await dockerContainerAction(modal.id, modal.action);
      await refetchContainers();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
    setModal(null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Docker</h2>
        <p className="text-body-md text-on-surface-variant">Manage containers and images.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0 border-b border-outline-variant">
        <button
          className={`px-4 py-2 text-data-md border-b-2 transition-colors ${tab === 'containers' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setTab('containers')}
        >
          Containers ({(containers ?? []).length})
        </button>
        <button
          className={`px-4 py-2 text-data-md border-b-2 transition-colors ${tab === 'images' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setTab('images')}
        >
          Images ({(images ?? []).length})
        </button>
      </div>

      {tab === 'containers' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Container</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Image</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Status</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                {(containers ?? []).map((c: any) => (
                  <tr key={c.id} className="hover:bg-surface-container-highest/50 transition-colors group border-l-[3px] border-transparent">
                    <td className="py-3 px-3 font-bold text-primary">{c.name}</td>
                    <td className="py-3 px-3 text-on-surface-variant truncate max-w-[200px]">{c.image}</td>
                    <td className="py-3 px-3"><StatusBadge status={c.status || 'unknown'} /></td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal({ id: c.id, action: 'start', name: c.name })} className="p-1 text-on-surface-variant hover:text-primary rounded" title="Start">
                          <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                        </button>
                        <button onClick={() => setModal({ id: c.id, action: 'stop', name: c.name })} className="p-1 text-on-surface-variant hover:text-error rounded" title="Stop">
                          <span className="material-symbols-outlined text-[20px]">stop</span>
                        </button>
                        <button onClick={() => setModal({ id: c.id, action: 'restart', name: c.name })} className="p-1 text-on-surface-variant hover:text-secondary rounded" title="Restart">
                          <span className="material-symbols-outlined text-[20px]">refresh</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'images' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Repository</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Tag</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Size</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">ID</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                {(images ?? []).map((img: any) => (
                  <tr key={img.id} className="hover:bg-surface-container-highest/50 transition-colors">
                    <td className="py-3 px-3 font-bold text-primary">{img.tags?.[0]?.split(':')[0] || '<none>'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{img.tags?.[0]?.split(':')[1] || 'latest'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{(img.size / (1024 ** 2)).toFixed(0)} MB</td>
                    <td className="py-3 px-3 text-outline font-mono">{img.id?.substring(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!modal}
        title={`${modal?.action?.toUpperCase()} Container`}
        message={`Are you sure you want to ${modal?.action} "${modal?.name}"?`}
        onConfirm={handleAction}
        onCancel={() => setModal(null)}
        loading={actionLoading}
        variant={modal?.action === 'stop' ? 'danger' : 'default'}
      />
    </div>
  );
}
