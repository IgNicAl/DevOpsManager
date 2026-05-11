import { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import {
  getActiveAlerts,
  getAlertHistory,
  getAlertConfig,
  addAlertRule,
  deleteAlertRule,
  type AlertRule,
} from '../services/api';
import { useSSE } from '../hooks/useSSE';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';
import Modal from '../components/ui/Modal';
import FormField, { TextInput, Select } from '../components/ui/FormField';

export default function Alerts() {
  const fetchActive = useCallback(() => getActiveAlerts(), []);
  const fetchHistory = useCallback(() => getAlertHistory(100), []);
  const fetchConfig = useCallback(() => getAlertConfig(), []);
  const { data: active, refetch: refetchActive } = usePolling(fetchActive, 10000);
  const { data: history, refetch: refetchHistory } = usePolling(fetchHistory, 30000);
  const { data: config, refetch: refetchConfig } = usePolling(fetchConfig, 60000);

  // Subscribe to SSE for live transitions
  useSSE('/api/alerts/stream', {
    events: ['snapshot', 'transition', 'ping'],
    onMessage: (event) => {
      if (event === 'transition') {
        refetchActive();
        refetchHistory();
        refetchConfig();
      }
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteAlertRule(deleteId); await refetchConfig(); await refetchActive(); } catch (err) { console.error(err); }
    setDeleteId(null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">Alerts</h2>
          <p className="text-body-md text-on-surface-variant">Threshold-based alerts. Active alerts appear in the sidebar.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> Add rule
        </button>
      </div>

      {/* Active */}
      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${(active ?? []).length > 0 ? 'bg-error pulse-error' : 'bg-outline'}`} />
          <span className="text-label-xs text-on-surface-variant tracking-wider">Active alerts ({(active ?? []).length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Kind</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Target</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Threshold</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Label</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Firing since</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(active ?? []).length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No active alerts</td></tr>
              ) : (active ?? []).map((r: AlertRule) => (
                <tr key={r.id} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-error uppercase">{r.kind}</td>
                  <td className="py-3 px-3 text-on-surface-variant font-mono">{r.target || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{r.threshold ?? '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{r.label || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant text-label-xs">{r.since ? new Date(r.since * 1000).toLocaleString() : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configured rules */}
      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
          <span className="text-label-xs text-on-surface-variant tracking-wider">Configured rules ({(config ?? []).length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Kind</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Target</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Threshold</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Label</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">State</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(config ?? []).length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-on-surface-variant">No rules configured</td></tr>
              ) : (config ?? []).map((r: AlertRule) => (
                <tr key={r.id} className="hover:bg-surface-container-highest/50 transition-colors group">
                  <td className="py-3 px-3 font-bold text-primary uppercase">{r.kind}</td>
                  <td className="py-3 px-3 text-on-surface-variant font-mono">{r.target || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{r.threshold ?? '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{r.label || '--'}</td>
                  <td className="py-3 px-3"><StatusBadge status={r.state === 'firing' ? 'Failed' : 'Active'} /></td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => setDeleteId(r.id)}
                      className="p-1 text-on-surface-variant hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove rule"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History */}
      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
          <span className="text-label-xs text-on-surface-variant tracking-wider">History (last {(history ?? []).length} transitions)</span>
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="border-b border-outline-variant sticky top-0 bg-surface-container-highest">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Time</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Kind</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Target</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Threshold</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Value</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Transition</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(history ?? []).length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-on-surface-variant">No history</td></tr>
              ) : [...(history ?? [])].reverse().map((h: any, i: number) => (
                <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-2 px-3 text-on-surface-variant font-mono text-label-xs">{new Date(h.ts * 1000).toLocaleString()}</td>
                  <td className="py-2 px-3 uppercase">{h.kind}</td>
                  <td className="py-2 px-3 font-mono text-on-surface-variant">{h.target || '--'}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{h.threshold ?? '--'}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{h.value != null ? h.value.toFixed(1) : '--'}</td>
                  <td className="py-2 px-3">
                    <span className={h.transition?.endsWith('firing') ? 'text-error' : 'text-primary'}>
                      {h.transition}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddRuleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => { await refetchConfig(); await refetchActive(); setCreateOpen(false); }}
      />

      <ConfirmModal
        open={!!deleteId}
        title="Remove alert rule"
        message="Remove this alert rule?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />
    </div>
  );
}

function AddRuleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<'cpu' | 'memory' | 'disk' | 'service'>('cpu');
  const [threshold, setThreshold] = useState('80');
  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('cpu'); setThreshold('80'); setTarget(''); setLabel(''); setError(null);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: any = { kind, label };
      if (kind === 'service') {
        payload.target = target;
      } else {
        payload.threshold = parseFloat(threshold);
        if (kind === 'disk' && target) payload.target = target;
      }
      const res = await addAlertRule(payload);
      if (res.data.success) onCreated();
      else setError(res.data.error || 'failed');
    } catch (err: any) {
      setError(err?.response?.data?.detail?.error || err?.message || 'Failed');
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      title="Add alert rule"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <FormField label="Kind">
        <Select value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="cpu">CPU</option>
          <option value="memory">Memory</option>
          <option value="disk">Disk</option>
          <option value="service">Service stopped</option>
        </Select>
      </FormField>
      {kind !== 'service' && (
        <FormField label="Threshold (%)" error={error || undefined}>
          <TextInput type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </FormField>
      )}
      {kind === 'disk' && (
        <FormField label="Path (optional, default /)">
          <TextInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="/var" />
        </FormField>
      )}
      {kind === 'service' && (
        <FormField label="Service name" error={error || undefined}>
          <TextInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="nginx.service" />
        </FormField>
      )}
      <FormField label="Label (optional)">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="High CPU on api server" />
      </FormField>
    </Modal>
  );
}
