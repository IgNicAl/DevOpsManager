import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getDockerContainers, getDockerImages, dockerContainerAction, getDockerNetworks, getDockerVolumes } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Docker() {
  const fetchContainers = useCallback(() => getDockerContainers(), []);
  const fetchImages = useCallback(() => getDockerImages(), []);
  const { data: containers, loading: containersLoading, error: containersError, refetch: refetchContainers } = usePolling(fetchContainers, 10000);
  const { data: images, loading: imagesLoading, error: imagesError } = usePolling(fetchImages, 30000);
  const fetchNetworks = useCallback(() => getDockerNetworks(), []);
  const fetchVolumes  = useCallback(() => getDockerVolumes(), []);
  const { data: networks, loading: networksLoading, error: networksError } = usePolling(fetchNetworks, 30000);
  const { data: volumes,  loading: volumesLoading,  error: volumesError  } = usePolling(fetchVolumes,  30000);
  const [tab, setTab] = useState<'containers' | 'images' | 'networks' | 'volumes'>('containers');
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
        <p className="text-body-md text-on-surface-variant">Manage containers, images, networks, and volumes.</p>
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
        <button
          className={`px-4 py-2 text-data-md border-b-2 transition-colors ${tab === 'networks' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setTab('networks')}
        >
          Networks ({(networks ?? []).length})
        </button>
        <button
          className={`px-4 py-2 text-data-md border-b-2 transition-colors ${tab === 'volumes' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setTab('volumes')}
        >
          Volumes ({(volumes ?? []).length})
        </button>
      </div>

      {tab === 'containers' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          {containersLoading && <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">Loading containers...</div>}
          {containersError && <div className="flex items-center justify-center py-16 text-error text-data-md">Error: {containersError}</div>}
          {!containersLoading && !containersError && (!containers || containers.length === 0) && (
            <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">No containers found.</div>
          )}
          {!containersLoading && !containersError && containers && containers.length > 0 && (
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
                  {containers.map((c: any) => (
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
          )}
        </div>
      )}

      {tab === 'images' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          {imagesLoading && <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">Loading images...</div>}
          {imagesError && <div className="flex items-center justify-center py-16 text-error text-data-md">Error: {imagesError}</div>}
          {!imagesLoading && !imagesError && (!images || images.length === 0) && (
            <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">No images found.</div>
          )}
          {!imagesLoading && !imagesError && images && images.length > 0 && (
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
                  {images.map((img: any) => (
                    <tr key={img.id} className="hover:bg-surface-container-highest/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-primary">{img.tags?.[0]?.split(':')[0] || '<none>'}</td>
                      <td className="py-3 px-3 text-on-surface-variant">{img.tags?.[0]?.split(':')[1] || 'latest'}</td>
                      <td className="py-3 px-3 text-on-surface-variant">{img.size_mb?.toFixed(0) ?? '--'} MB</td>
                      <td className="py-3 px-3 text-outline font-mono">{img.id?.substring(0, 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'networks' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          {networksLoading && <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">Loading networks...</div>}
          {networksError && <div className="flex items-center justify-center py-16 text-error text-data-md">Error: {networksError}</div>}
          {!networksLoading && !networksError && (!networks || networks.length === 0) && (
            <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">No networks found.</div>
          )}
          {!networksLoading && !networksError && networks && networks.length > 0 && (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Driver</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Scope</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Subnet</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Gateway</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Containers</th>
                  </tr>
                </thead>
                <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                  {networks.map((net: any) => (
                    <tr key={net.id} className="hover:bg-surface-container-highest/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-primary">{net.name}</td>
                      <td className="py-3 px-3 text-on-surface-variant">{net.driver || '--'}</td>
                      <td className="py-3 px-3 text-on-surface-variant">{net.scope || '--'}</td>
                      <td className="py-3 px-3 text-on-surface-variant font-mono">{net.subnet || '--'}</td>
                      <td className="py-3 px-3 text-on-surface-variant font-mono">{net.gateway || '--'}</td>
                      <td className="py-3 px-3 text-on-surface-variant text-right">{net.containers_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'volumes' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          {volumesLoading && <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">Loading volumes...</div>}
          {volumesError && <div className="flex items-center justify-center py-16 text-error text-data-md">Error: {volumesError}</div>}
          {!volumesLoading && !volumesError && (!volumes || volumes.length === 0) && (
            <div className="flex items-center justify-center py-16 text-on-surface-variant text-data-md">No volumes found.</div>
          )}
          {!volumesLoading && !volumesError && volumes && volumes.length > 0 && (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Driver</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Mount Point</th>
                    <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Size</th>
                  </tr>
                </thead>
                <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                  {volumes.map((vol: any) => (
                    <tr key={vol.name} className="hover:bg-surface-container-highest/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-primary">{vol.name}</td>
                      <td className="py-3 px-3 text-on-surface-variant">{vol.driver || '--'}</td>
                      <td className="py-3 px-3 text-outline font-mono truncate max-w-[320px]">{vol.mountpoint || '--'}</td>
                      <td className="py-3 px-3 text-on-surface-variant text-right">
                        {vol.size_bytes >= 0 ? `${(vol.size_bytes / (1024 ** 2)).toFixed(1)} MB` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
