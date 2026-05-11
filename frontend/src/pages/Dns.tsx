import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import {
  getHostsEntries,
  addHostsEntry,
  updateHostsEntry,
  deleteHostsEntry,
  resolveDns,
  sslCheck,
  getTraefikRoutes,
  getTraefikCertificates,
  type HostsEntry,
} from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import FormField, { TextInput, Select } from '../components/ui/FormField';
import EditableText from '../components/ui/EditableText';
import { ConfirmPopover } from '../components/ui/InlinePopover';
import { useToast } from '../components/ui/Toast';

export default function Dns() {
  const fetchHosts = useCallback(() => getHostsEntries(), []);
  const fetchTraefik = useCallback(() => getTraefikRoutes(), []);
  const fetchTraefikCerts = useCallback(() => getTraefikCertificates(), []);
  const { data: hosts, refetch: refetchHosts } = usePolling(fetchHosts, 30000);
  const { data: traefikRoutes, error: traefikRoutesErr } = usePolling(fetchTraefik, 60000);
  const { data: traefikCerts } = usePolling(fetchTraefikCerts, 60000);

  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();

  const updateField = async (entry: HostsEntry, fields: Partial<{ ip: string; hostnames: string[]; comment: string }>) => {
    try {
      await updateHostsEntry(entry.line_no, {
        ip: fields.ip ?? entry.ip,
        hostnames: fields.hostnames ?? entry.hostnames,
        comment: fields.comment ?? entry.comment,
      });
      toast.success('Saved');
      await refetchHosts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Update failed', msg);
      throw err;
    }
  };

  const deleteEntry = async (line_no: number) => {
    try {
      await deleteHostsEntry(line_no);
      toast.success('Entry removed');
      await refetchHosts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Delete failed', msg);
    }
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Domains &amp; DNS</h2>
        <p className="text-body-md text-on-surface-variant">/etc/hosts, DNS resolution, SSL certificates, Traefik.</p>
      </div>

      {/* /etc/hosts */}
      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest flex items-center justify-between">
          <span className="text-label-xs text-on-surface-variant tracking-wider">/etc/hosts</span>
          <button
            onClick={() => setCreateOpen(true)}
            className="text-data-md text-primary hover:text-primary-fixed flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> Add entry
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">IP</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Hostnames</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Comment</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(hosts ?? []).length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-on-surface-variant">No entries</td></tr>
              )}
              {(hosts ?? []).map((h: HostsEntry) => (
                <HostsRow key={h.line_no} entry={h} onUpdate={(fields) => updateField(h, fields)} onDelete={() => deleteEntry(h.line_no)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DnsResolveCard />
        <SslCheckCard />
      </div>

      {/* Traefik */}
      {traefikRoutesErr ? null : (
        <div className="surface-card border border-outline-variant rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
            <span className="text-label-xs text-on-surface-variant tracking-wider">Traefik routes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="border-b border-outline-variant">
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Rule</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Service</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">TLS</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
                {(traefikRoutes ?? []).length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No routes</td></tr>
                )}
                {(traefikRoutes ?? []).map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
                    <td className="py-3 px-3 font-bold text-primary">{r.name}</td>
                    <td className="py-3 px-3 text-on-surface-variant truncate max-w-[400px]">{r.rule}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{r.service}</td>
                    <td className="py-3 px-3"><StatusBadge status={r.tls ? 'Active' : 'Inactive'} /></td>
                    <td className="py-3 px-3"><StatusBadge status={r.status || 'unknown'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(traefikCerts ?? []).length > 0 && (
        <div className="surface-card border border-outline-variant rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
            <span className="text-label-xs text-on-surface-variant tracking-wider">Traefik ACME certificates</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="border-b border-outline-variant">
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Domain</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">SANs</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Resolver</th>
                </tr>
              </thead>
              <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
                {(traefikCerts ?? []).map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
                    <td className="py-3 px-3 font-bold text-primary">{c.domain}</td>
                    <td className="py-3 px-3 text-on-surface-variant truncate max-w-[400px]">{(c.sans || []).join(', ') || '--'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{c.resolver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <HostsModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={async (data) => {
          try {
            await addHostsEntry(data);
            toast.success('Entry added');
            await refetchHosts();
            setCreateOpen(false);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'failed';
            toast.error('Add failed', msg);
            throw err;
          }
        }}
      />
    </div>
  );
}

function HostsRow({ entry, onUpdate, onDelete }: {
  entry: HostsEntry;
  onUpdate: (fields: Partial<{ ip: string; hostnames: string[]; comment: string }>) => Promise<void>;
  onDelete: () => void;
}) {
  const delBtnRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <tr className="hover:bg-surface-container-highest/50 transition-colors group">
      <td className="py-3 px-3 font-mono text-primary">
        <EditableText
          value={entry.ip}
          onSave={(next) => onUpdate({ ip: next })}
          validate={(v) => (v ? null : 'IP required')}
        />
      </td>
      <td className="py-3 px-3 font-mono text-on-surface-variant">
        <EditableText
          value={entry.hostnames.join(' ')}
          onSave={(next) => onUpdate({ hostnames: next.split(/\s+/).filter(Boolean) })}
          validate={(v) => (v.trim() ? null : 'At least one hostname required')}
        />
      </td>
      <td className="py-3 px-3 text-on-surface-variant">
        <EditableText value={entry.comment || ''} placeholder="add comment" onSave={(next) => onUpdate({ comment: next })} />
      </td>
      <td className="py-3 px-3 text-right">
        <button
          ref={delBtnRef}
          onClick={() => setConfirm(true)}
          className="p-1 text-on-surface-variant hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
        <ConfirmPopover
          open={confirm}
          anchorRef={delBtnRef}
          message="Remove this entry?"
          onCancel={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); onDelete(); }}
        />
      </td>
    </tr>
  );
}

function HostsModal({
  open, entry, onClose, onSave,
}: { open: boolean; entry?: HostsEntry | null; onClose: () => void; onSave: (data: { ip: string; hostnames: string[]; comment?: string }) => Promise<void> }) {
  const [ip, setIp] = useState(entry?.ip ?? '');
  const [hostnames, setHostnames] = useState(entry?.hostnames.join(' ') ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setIp(entry?.ip ?? '');
      setHostnames(entry?.hostnames.join(' ') ?? '');
      setComment(entry?.comment ?? '');
      setError(null);
    }
  }, [open, entry]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const list = hostnames.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      await onSave({ ip: ip.trim(), hostnames: list, comment: comment.trim() || undefined });
    } catch (err: any) {
      setError(err?.response?.data?.detail?.error || err?.message || 'Failed');
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      title={entry ? 'Edit /etc/hosts entry' : 'Add /etc/hosts entry'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">Cancel</button>
          <button onClick={submit} disabled={!ip || !hostnames || busy} className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <FormField label="IP address" error={error || undefined}>
        <TextInput value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.1" />
      </FormField>
      <FormField label="Hostnames (space-separated)">
        <TextInput value={hostnames} onChange={(e) => setHostnames(e.target.value)} placeholder="server.local server" />
      </FormField>
      <FormField label="Comment (optional)">
        <TextInput value={comment} onChange={(e) => setComment(e.target.value)} />
      </FormField>
    </Modal>
  );
}

function DnsResolveCard() {
  const [name, setName] = useState('');
  const [type, setType] = useState('A');
  const [result, setResult] = useState<{ name: string; type: string; records: string[]; tool: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await resolveDns(name.trim(), type);
      if (res.data.success) setResult(res.data.data);
      else setError(res.data.error || 'failed');
    } catch (err: any) {
      setError(err?.response?.data?.detail?.error || err?.message || 'failed');
    }
    setBusy(false);
  };

  return (
    <div className="surface-card border border-outline-variant rounded p-4 flex flex-col gap-3">
      <h3 className="text-label-xs text-on-surface-variant tracking-wider border-b border-outline-variant pb-2">Resolve DNS</h3>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-surface-container-low border border-outline-variant text-on-surface text-data-md py-1.5 px-3 terminal-focus"
          placeholder="example.com"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option>A</option><option>AAAA</option><option>MX</option><option>TXT</option>
          <option>CNAME</option><option>NS</option>
        </Select>
        <button
          onClick={submit}
          disabled={!name || busy}
          className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
        >
          {busy ? '…' : 'Resolve'}
        </button>
      </div>
      {error && <div className="text-error text-data-md">{error}</div>}
      {result && (
        <div className="bg-surface-container-low p-3 rounded-sm text-data-md font-mono text-on-surface">
          <div className="text-label-xs text-on-surface-variant mb-1">{result.name} ({result.type}) via {result.tool}</div>
          {result.records.length === 0 ? (
            <div className="text-on-surface-variant">no records</div>
          ) : (
            result.records.map((r, i) => <div key={i} className="text-primary">{r}</div>)
          )}
        </div>
      )}
    </div>
  );
}

function SslCheckCard() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(443);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await sslCheck(host.trim(), port);
      if (res.data.success) setResult(res.data.data);
      else setError(res.data.error || 'failed');
    } catch (err: any) {
      setError(err?.response?.data?.detail?.error || err?.message || 'failed');
    }
    setBusy(false);
  };

  const daysColor = result ? (result.days_left > 30 ? 'text-primary' : result.days_left > 7 ? 'text-tertiary-container' : 'text-error') : '';

  return (
    <div className="surface-card border border-outline-variant rounded p-4 flex flex-col gap-3">
      <h3 className="text-label-xs text-on-surface-variant tracking-wider border-b border-outline-variant pb-2">Check SSL Certificate</h3>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-surface-container-low border border-outline-variant text-on-surface text-data-md py-1.5 px-3 terminal-focus"
          placeholder="example.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <input
          className="w-24 bg-surface-container-low border border-outline-variant text-on-surface text-data-md py-1.5 px-3 terminal-focus"
          type="number"
          value={port}
          onChange={(e) => setPort(parseInt(e.target.value, 10) || 443)}
        />
        <button
          onClick={submit}
          disabled={!host || busy}
          className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
        >
          {busy ? '…' : 'Check'}
        </button>
      </div>
      {error && <div className="text-error text-data-md">{error}</div>}
      {result && (
        <div className="bg-surface-container-low p-3 rounded-sm text-data-md font-mono text-on-surface space-y-1">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Expires</span>
            <span className={daysColor}>{result.not_after?.substring(0, 10)} ({result.days_left} days)</span>
          </div>
          <div className="flex justify-between"><span className="text-on-surface-variant">Issuer</span><span className="truncate max-w-[60%]">{result.issuer}</span></div>
          <div className="flex justify-between"><span className="text-on-surface-variant">Subject</span><span className="truncate max-w-[60%]">{result.subject}</span></div>
          <div><span className="text-on-surface-variant">SANs:</span> <span className="text-on-surface">{(result.sans || []).slice(0, 8).join(', ')}{(result.sans || []).length > 8 ? '…' : ''}</span></div>
        </div>
      )}
    </div>
  );
}
