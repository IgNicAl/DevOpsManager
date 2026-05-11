import { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import {
  getDockerContainers,
  getDockerImages,
  getDockerNetworks,
  getDockerVolumes,
  dockerContainerAction,
  createDockerContainer,
  inspectDockerContainer,
  getDockerContainerStats,
  deleteDockerImage,
  createDockerNetwork,
  deleteDockerNetwork,
  deleteDockerVolume,
  inspectDockerVolume,
  renameDockerContainer,
  dockerPullImageUrl,
} from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';
import Modal from '../components/ui/Modal';
import FormField, { TextInput, Select } from '../components/ui/FormField';
import Sparkline from '../components/charts/Sparkline';
import EditableText from '../components/ui/EditableText';
import { useToast } from '../components/ui/Toast';
import { openSSE } from '../services/sse';
import NetworkTopology from './Docker/NetworkTopology';

type Tab = 'containers' | 'images' | 'networks' | 'volumes' | 'topology';

export default function Docker() {
  const fetchContainers = useCallback(() => getDockerContainers(), []);
  const fetchImages = useCallback(() => getDockerImages(), []);
  const fetchNetworks = useCallback(() => getDockerNetworks(), []);
  const fetchVolumes = useCallback(() => getDockerVolumes(), []);
  const { data: containers, refetch: refetchContainers } = usePolling(fetchContainers, 10000);
  const { data: images, refetch: refetchImages } = usePolling(fetchImages, 30000);
  const { data: networks, refetch: refetchNetworks } = usePolling(fetchNetworks, 15000);
  const { data: volumes, refetch: refetchVolumes } = usePolling(fetchVolumes, 15000);

  const [tab, setTab] = useState<Tab>('containers');
  const [actionModal, setActionModal] = useState<{ id: string; action: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<any>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [imageDeleteId, setImageDeleteId] = useState<string | null>(null);
  const [networkDeleteName, setNetworkDeleteName] = useState<string | null>(null);
  const [volumeDeleteName, setVolumeDeleteName] = useState<string | null>(null);
  const [networkCreateOpen, setNetworkCreateOpen] = useState(false);
  const [volumeInspect, setVolumeInspect] = useState<any>(null);

  const handleAction = async () => {
    if (!actionModal) return;
    setActionLoading(true);
    try {
      await dockerContainerAction(actionModal.id, actionModal.action);
      await refetchContainers();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
    setActionModal(null);
  };

  const openInspect = async (id: string) => {
    setInspectId(id);
    setInspectData(null);
    try {
      const res = await inspectDockerContainer(id);
      if (res.data.success) setInspectData(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteImage = async () => {
    if (!imageDeleteId) return;
    try { await deleteDockerImage(imageDeleteId); await refetchImages(); } catch (err) { console.error(err); }
    setImageDeleteId(null);
  };

  const handleDeleteNetwork = async () => {
    if (!networkDeleteName) return;
    try { await deleteDockerNetwork(networkDeleteName); await refetchNetworks(); } catch (err) { console.error(err); }
    setNetworkDeleteName(null);
  };

  const handleDeleteVolume = async () => {
    if (!volumeDeleteName) return;
    try { await deleteDockerVolume(volumeDeleteName); await refetchVolumes(); } catch (err) { console.error(err); }
    setVolumeDeleteName(null);
  };

  const openVolumeInspect = async (name: string) => {
    try {
      const res = await inspectDockerVolume(name);
      if (res.data.success) setVolumeInspect({ name, attrs: res.data.data });
    } catch (err) { console.error(err); }
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">Docker</h2>
          <p className="text-body-md text-on-surface-variant">Containers, images, networks, volumes.</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'containers' && (
            <button
              onClick={() => setCreateOpen(true)}
              className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span> Create container
            </button>
          )}
          {tab === 'images' && (
            <button
              onClick={() => setPullOpen(true)}
              className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">cloud_download</span> Pull image
            </button>
          )}
          {tab === 'networks' && (
            <button
              onClick={() => setNetworkCreateOpen(true)}
              className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span> Create network
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-0 border-b border-outline-variant">
        {(['containers', 'images', 'networks', 'volumes', 'topology'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-data-md border-b-2 transition-colors capitalize ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'topology' ? (
              <>topology</>
            ) : (
              <>
                {t} (
                {t === 'containers' ? (containers ?? []).length :
                  t === 'images' ? (images ?? []).length :
                  t === 'networks' ? (networks ?? []).length :
                  (volumes ?? []).length}
                )
              </>
            )}
          </button>
        ))}
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
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Stats</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                {(containers ?? []).map((c: any) => (
                  <ContainerRow
                    key={c.id}
                    container={c}
                    onAction={(action) => setActionModal({ id: c.id, action, name: c.name })}
                    onInspect={() => openInspect(c.id)}
                    onRenamed={refetchContainers}
                  />
                ))}
                {(containers ?? []).length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No containers</td></tr>
                )}
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
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                {(images ?? []).map((img: any) => (
                  <tr key={img.id} className="hover:bg-surface-container-highest/50 transition-colors group">
                    <td className="py-3 px-3 font-bold text-primary">{img.tags?.[0]?.split(':')[0] || '<none>'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{img.tags?.[0]?.split(':')[1] || 'latest'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{img.size_mb} MB</td>
                    <td className="py-3 px-3 text-outline font-mono">{img.id?.substring(0, 12)}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setImageDeleteId(img.id)}
                        className="p-1 text-on-surface-variant hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove image"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {(images ?? []).length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No images</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'networks' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Driver</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Scope</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Subnets</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Containers</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                {(networks ?? []).map((n: any) => (
                  <tr key={n.id} className="hover:bg-surface-container-highest/50 transition-colors group">
                    <td className="py-3 px-3 font-bold text-primary">{n.name}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{n.driver}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{n.scope}</td>
                    <td className="py-3 px-3 text-on-surface-variant font-mono">{(n.subnets || []).join(', ') || '--'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{n.containers}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setNetworkDeleteName(n.name)}
                        className="p-1 text-on-surface-variant hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove network"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {(networks ?? []).length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-on-surface-variant">No networks</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'topology' && <NetworkTopology />}

      {tab === 'volumes' && (
        <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Driver</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Mountpoint</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Created</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
                {(volumes ?? []).map((v: any) => (
                  <tr key={v.name} className="hover:bg-surface-container-highest/50 transition-colors group">
                    <td className="py-3 px-3 font-bold text-primary">{v.name}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{v.driver}</td>
                    <td className="py-3 px-3 text-on-surface-variant font-mono truncate max-w-[300px]">{v.mountpoint}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{v.created_at?.substring(0, 19)}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openVolumeInspect(v.name)}
                          className="p-1 text-on-surface-variant hover:text-primary rounded"
                          title="Inspect"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        <button
                          onClick={() => setVolumeDeleteName(v.name)}
                          className="p-1 text-on-surface-variant hover:text-error rounded"
                          title="Remove"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(volumes ?? []).length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No volumes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!actionModal}
        title={`${actionModal?.action?.toUpperCase()} Container`}
        message={`Are you sure you want to ${actionModal?.action} "${actionModal?.name}"?`}
        onConfirm={handleAction}
        onCancel={() => setActionModal(null)}
        loading={actionLoading}
        variant={actionModal?.action === 'stop' || actionModal?.action === 'remove' ? 'danger' : 'default'}
      />

      <ConfirmModal
        open={!!imageDeleteId}
        title="Remove Image"
        message="Remove this image? This action cannot be undone."
        onConfirm={handleDeleteImage}
        onCancel={() => setImageDeleteId(null)}
        variant="danger"
      />

      <ConfirmModal
        open={!!networkDeleteName}
        title="Remove Network"
        message={`Remove network "${networkDeleteName}"?`}
        onConfirm={handleDeleteNetwork}
        onCancel={() => setNetworkDeleteName(null)}
        variant="danger"
      />

      <ConfirmModal
        open={!!volumeDeleteName}
        title="Remove Volume"
        message={`Remove volume "${volumeDeleteName}"? Data will be lost.`}
        onConfirm={handleDeleteVolume}
        onCancel={() => setVolumeDeleteName(null)}
        variant="danger"
      />

      <CreateContainerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); refetchContainers(); }}
      />

      <InspectModal
        open={!!inspectId}
        data={inspectData}
        onClose={() => { setInspectId(null); setInspectData(null); }}
      />

      <PullImageModal
        open={pullOpen}
        onClose={() => { setPullOpen(false); refetchImages(); }}
      />

      <CreateNetworkModal
        open={networkCreateOpen}
        onClose={() => setNetworkCreateOpen(false)}
        onCreated={() => { setNetworkCreateOpen(false); refetchNetworks(); }}
      />

      <Modal open={!!volumeInspect} title={volumeInspect?.name || 'Volume'} onClose={() => setVolumeInspect(null)} size="lg">
        <pre className="font-mono text-data-md text-on-surface-variant whitespace-pre-wrap break-all">
          {JSON.stringify(volumeInspect?.attrs ?? {}, null, 2)}
        </pre>
      </Modal>
    </div>
  );
}

function ContainerRow({ container: c, onAction, onInspect, onRenamed }: { container: any; onAction: (a: string) => void; onInspect: () => void; onRenamed: () => void }) {
  const [stats, setStats] = useState<{ cpu_percent: number; mem_percent: number } | null>(null);
  const [history, setHistory] = useState<{ cpu: number[]; mem: number[] }>({ cpu: [], mem: [] });
  const toast = useToast();

  useEffect(() => {
    if (c.status !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await getDockerContainerStats(c.id);
        if (cancelled || !res.data.success || !res.data.data) return;
        const s = res.data.data;
        setStats({ cpu_percent: s.cpu_percent, mem_percent: s.mem_percent });
        setHistory((h) => ({
          cpu: [...h.cpu, s.cpu_percent].slice(-12),
          mem: [...h.mem, s.mem_percent].slice(-12),
        }));
      } catch {
        // ignore transient errors
      }
    };
    tick();
    const handle = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [c.id, c.status]);

  return (
    <tr className="hover:bg-surface-container-highest/50 transition-colors group border-l-[3px] border-transparent">
      <td className="py-3 px-3 font-bold text-primary">
        <EditableText
          value={c.name}
          onSave={async (next) => {
            try {
              await renameDockerContainer(c.id, next);
              toast.success(`Renamed to ${next}`);
              onRenamed();
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'failed';
              toast.error('Rename failed', msg);
              throw err;
            }
          }}
        />
      </td>
      <td className="py-3 px-3 text-on-surface-variant truncate max-w-[200px]">{c.image}</td>
      <td className="py-3 px-3"><StatusBadge status={c.status || 'unknown'} /></td>
      <td className="py-3 px-3">
        {stats ? (
          <div className="flex items-center gap-3 text-data-md">
            <div className="flex items-center gap-2">
              <span className="text-on-surface-variant">CPU</span>
              <span className="text-primary">{stats.cpu_percent.toFixed(1)}%</span>
              <Sparkline values={history.cpu} yMax={100} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-on-surface-variant">MEM</span>
              <span className="text-secondary">{stats.mem_percent.toFixed(1)}%</span>
              <Sparkline values={history.mem} yMax={100} color="var(--color-secondary)" />
            </div>
          </div>
        ) : (
          <span className="text-on-surface-variant/50">--</span>
        )}
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <button onClick={onInspect} className="p-1 text-on-surface-variant hover:text-primary rounded" title="Inspect">
            <span className="material-symbols-outlined text-[20px]">visibility</span>
          </button>
          <button onClick={() => onAction('start')} className="p-1 text-on-surface-variant hover:text-primary rounded" title="Start">
            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
          </button>
          <button onClick={() => onAction('stop')} className="p-1 text-on-surface-variant hover:text-error rounded" title="Stop">
            <span className="material-symbols-outlined text-[20px]">stop</span>
          </button>
          <button onClick={() => onAction('restart')} className="p-1 text-on-surface-variant hover:text-secondary rounded" title="Restart">
            <span className="material-symbols-outlined text-[20px]">refresh</span>
          </button>
          <button onClick={() => onAction('remove')} className="p-1 text-on-surface-variant hover:text-error rounded" title="Remove">
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

function CreateContainerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [ports, setPorts] = useState('');
  const [volumes, setVolumes] = useState('');
  const [envText, setEnvText] = useState('');
  const [restart, setRestart] = useState<'no' | 'always' | 'on-failure' | 'unless-stopped'>('no');
  const [command, setCommand] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const reset = () => {
    setStep(0); setImage(''); setName(''); setPorts(''); setVolumes('');
    setEnvText(''); setRestart('no'); setCommand(''); setError(null);
  };

  useEffect(() => { if (open) setStep(0); }, [open]);

  const portsArr = ports.split(',').map((s) => s.trim()).filter(Boolean);
  const volsArr = volumes.split(',').map((s) => s.trim()).filter(Boolean);
  const envList: string[] = [];
  for (const line of envText.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) envList.push(line.trim());
  }
  const dockerRun = buildDockerRun({ image, name, ports: portsArr, volumes: volsArr, env: envList, restart, command });

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    const env: Record<string, string> = {};
    for (const line of envList) {
      const eq = line.indexOf('=');
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    try {
      const res = await createDockerContainer({
        image: image.trim(),
        name: name.trim() || undefined,
        ports: portsArr,
        volumes: volsArr,
        env,
        restart_policy: restart,
        command: command.trim() || undefined,
      });
      if (res.data.success) {
        toast.success(`Container created: ${res.data.data?.name || image}`);
        reset();
        onCreated();
      } else {
        setError(res.data.error || 'Failed to create container');
        toast.error('Container creation failed', res.data.error || undefined);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.error || err?.message || 'Failed';
      setError(msg);
      toast.error('Container creation failed', msg);
    }
    setBusy(false);
  };

  const stepLabels = ['Image', 'Ports & Volumes', 'Environment & Runtime'];
  const canAdvance = step === 0 ? !!image : true;
  const isLast = step === 2;

  return (
    <Modal
      open={open}
      title="Create container"
      onClose={() => { reset(); onClose(); }}
      size="lg"
      footer={
        <div className="flex w-full justify-between gap-3">
          <button
            onClick={() => { reset(); onClose(); }}
            className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
              >
                Back
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={!image || busy}
                className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create container'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        {stepLabels.map((lbl, i) => (
          <button
            key={lbl}
            onClick={() => i < step && setStep(i)}
            className={`flex items-center gap-2 text-label-xs uppercase tracking-wider ${
              i === step ? 'text-primary' : i < step ? 'text-on-surface-variant cursor-pointer hover:text-on-surface' : 'text-on-surface-variant/50'
            }`}
            disabled={i > step}
          >
            <span
              className={`w-6 h-6 rounded-full inline-flex items-center justify-center border ${
                i === step ? 'bg-primary text-on-primary border-primary' :
                  i < step ? 'bg-primary-container text-on-primary-container border-primary-container' :
                  'border-outline-variant'
              }`}
            >
              {i + 1}
            </span>
            <span>{lbl}</span>
            {i < stepLabels.length - 1 && <span className="text-on-surface-variant/30 mx-1">·</span>}
          </button>
        ))}
      </div>

      {step === 0 && (
        <>
          <FormField label="Image" error={error || undefined} hint="Format: image[:tag] or registry/repo:tag">
            <TextInput placeholder="nginx:latest" value={image} onChange={(e) => setImage(e.target.value)} autoFocus />
          </FormField>
          <FormField label="Name (optional)">
            <TextInput placeholder="my-container" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </>
      )}

      {step === 1 && (
        <>
          <FormField label="Ports (comma-separated, host:container[/proto])" hint="e.g. 8080:80/tcp, 8443:443/tcp">
            <TextInput placeholder="8080:80/tcp" value={ports} onChange={(e) => setPorts(e.target.value)} />
          </FormField>
          <FormField label="Volumes (comma-separated, /host:/container[:ro])" hint="e.g. /data:/var/lib/data">
            <TextInput placeholder="/data:/var/lib/data" value={volumes} onChange={(e) => setVolumes(e.target.value)} />
          </FormField>
        </>
      )}

      {step === 2 && (
        <>
          <FormField label="Environment (one KEY=VALUE per line)">
            <textarea
              className="bg-surface-container-low border border-outline-variant px-3 py-1.5 text-data-md text-on-surface focus:outline-none focus:border-primary rounded-sm font-mono w-full"
              rows={4}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="DEBUG=1&#10;DATABASE_URL=postgres://..."
            />
          </FormField>
          <FormField label="Restart policy">
            <Select value={restart} onChange={(e) => setRestart(e.target.value as any)}>
              <option value="no">no</option>
              <option value="always">always</option>
              <option value="on-failure">on-failure</option>
              <option value="unless-stopped">unless-stopped</option>
            </Select>
          </FormField>
          <FormField label="Command override (optional)">
            <TextInput value={command} onChange={(e) => setCommand(e.target.value)} placeholder="/bin/sh -c '...'" />
          </FormField>
        </>
      )}

      <div className="mt-4 surface-card bg-surface-container-lowest border border-outline-variant rounded-sm p-3">
        <div className="text-label-xs text-on-surface-variant mb-1">Equivalent docker command</div>
        <pre className="text-data-md font-mono text-primary whitespace-pre-wrap break-all">{dockerRun}</pre>
      </div>
    </Modal>
  );
}

function buildDockerRun({ image, name, ports, volumes, env, restart, command }: {
  image: string; name: string; ports: string[]; volumes: string[]; env: string[]; restart: string; command: string;
}): string {
  const parts: string[] = ['docker run -d'];
  if (name) parts.push(`--name ${name}`);
  if (restart && restart !== 'no') parts.push(`--restart ${restart}`);
  for (const p of ports) parts.push(`-p ${p}`);
  for (const v of volumes) parts.push(`-v ${v}`);
  for (const e of env) parts.push(`-e ${e.includes(' ') ? `'${e}'` : e}`);
  parts.push(image || '<image>');
  if (command) parts.push(command);
  return parts.join(' \\\n  ');
}

function CreateNetworkModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [driver, setDriver] = useState<'bridge' | 'overlay' | 'macvlan'>('bridge');
  const [subnet, setSubnet] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createDockerNetwork({ name: name.trim(), driver, subnet: subnet.trim() || undefined });
      if (res.data.success) {
        setName(''); setSubnet('');
        onCreated();
      } else {
        setError(res.data.error || 'Failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail?.error || err?.message || 'Failed');
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      title="Create Docker Network"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name || busy}
            className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <FormField label="Name" error={error || undefined}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="my-net" />
      </FormField>
      <FormField label="Driver">
        <Select value={driver} onChange={(e) => setDriver(e.target.value as any)}>
          <option value="bridge">bridge</option>
          <option value="overlay">overlay</option>
          <option value="macvlan">macvlan</option>
        </Select>
      </FormField>
      <FormField label="Subnet (optional)" hint="e.g. 172.20.0.0/16">
        <TextInput value={subnet} onChange={(e) => setSubnet(e.target.value)} placeholder="" />
      </FormField>
    </Modal>
  );
}

function InspectModal({ open, data, onClose }: { open: boolean; data: any; onClose: () => void }) {
  const [section, setSection] = useState<'env' | 'mounts' | 'networks' | 'labels' | 'raw'>('env');
  if (!open) return null;

  const env = data?.env ?? [];
  const mounts = data?.mounts ?? [];
  const networks = data?.networks ?? {};
  const labels = data?.labels ?? {};

  return (
    <Modal open={open} title={data?.name ? `Inspect: ${data.name}` : 'Inspect'} onClose={onClose} size="xl">
      {!data ? (
        <div className="text-on-surface-variant">Loading…</div>
      ) : (
        <>
          <div className="flex gap-0 border-b border-outline-variant mb-3">
            {(['env', 'mounts', 'networks', 'labels', 'raw'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`px-3 py-1.5 text-data-md border-b-2 capitalize ${
                  section === s ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {section === 'env' && (
            <table className="w-full text-data-md font-mono">
              <tbody className="divide-y divide-outline-variant/30">
                {env.length === 0 && <tr><td className="py-3 text-on-surface-variant">No env vars</td></tr>}
                {env.map((e: string, i: number) => {
                  const eq = e.indexOf('=');
                  const k = eq > 0 ? e.slice(0, eq) : e;
                  const v = eq > 0 ? e.slice(eq + 1) : '';
                  return (
                    <tr key={i}>
                      <td className="py-1.5 pr-4 text-primary whitespace-nowrap">{k}</td>
                      <td className="py-1.5 text-on-surface-variant break-all">{v}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {section === 'mounts' && (
            <table className="w-full text-data-md font-mono">
              <thead><tr><th className="text-left text-label-xs text-on-surface-variant">Source</th><th className="text-left text-label-xs text-on-surface-variant">Destination</th><th className="text-left text-label-xs text-on-surface-variant">Mode</th></tr></thead>
              <tbody className="divide-y divide-outline-variant/30">
                {mounts.length === 0 && <tr><td colSpan={3} className="py-3 text-on-surface-variant">No mounts</td></tr>}
                {mounts.map((m: any, i: number) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-4 text-on-surface break-all">{m.Source || m.source}</td>
                    <td className="py-1.5 pr-4 text-on-surface break-all">{m.Destination || m.destination}</td>
                    <td className="py-1.5 text-on-surface-variant">{m.Mode || m.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {section === 'networks' && (
            <table className="w-full text-data-md font-mono">
              <tbody className="divide-y divide-outline-variant/30">
                {Object.keys(networks).length === 0 && <tr><td className="py-3 text-on-surface-variant">No networks</td></tr>}
                {Object.entries(networks).map(([n, info]: any) => (
                  <tr key={n}>
                    <td className="py-1.5 pr-4 text-primary">{n}</td>
                    <td className="py-1.5 text-on-surface-variant">{info?.IPAddress || info?.ip || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {section === 'labels' && (
            <table className="w-full text-data-md font-mono">
              <tbody className="divide-y divide-outline-variant/30">
                {Object.keys(labels).length === 0 && <tr><td className="py-3 text-on-surface-variant">No labels</td></tr>}
                {Object.entries(labels).map(([k, v]: any) => (
                  <tr key={k}>
                    <td className="py-1.5 pr-4 text-primary break-all">{k}</td>
                    <td className="py-1.5 text-on-surface-variant break-all">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {section === 'raw' && (
            <pre className="text-data-md text-on-surface-variant whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </>
      )}
    </Modal>
  );
}

function PullImageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [image, setImage] = useState('');
  const [pulling, setPulling] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const start = () => {
    if (!image) return;
    setPulling(true);
    setDone(false);
    setEvents([`> docker pull ${image}`]);
    const es = openSSE(dockerPullImageUrl(image), {
      events: ['progress', 'done', 'error'],
      onMessage: (event, data: any) => {
        if (event === 'done') {
          setEvents((e) => [...e, '✓ pull complete']);
          setDone(true);
          setPulling(false);
          es.close();
          return;
        }
        if (event === 'error') {
          setEvents((e) => [...e, `error: ${data?.error || 'unknown'}`]);
          setPulling(false);
          es.close();
          return;
        }
        const status = data?.status || '';
        const id = data?.id || '';
        const progress = data?.progress || '';
        setEvents((e) => [...e.slice(-200), `${id ? id + ': ' : ''}${status}${progress ? ' ' + progress : ''}`]);
      },
      onError: () => {
        setPulling(false);
        es.close();
      },
    });
  };

  const close = () => {
    setImage(''); setEvents([]); setDone(false); setPulling(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Pull Image"
      onClose={close}
      size="lg"
      footer={
        <>
          <button onClick={close} className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">
            {done ? 'Close' : 'Cancel'}
          </button>
          {!pulling && !done && (
            <button
              onClick={start}
              disabled={!image}
              className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
            >
              Pull
            </button>
          )}
        </>
      }
    >
      <FormField label="Image">
        <TextInput value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:latest" disabled={pulling} />
      </FormField>
      {events.length > 0 && (
        <div className="bg-surface-container-low border border-outline-variant rounded-sm p-3 max-h-80 overflow-y-auto font-mono text-data-md text-on-surface-variant">
          {events.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </Modal>
  );
}
