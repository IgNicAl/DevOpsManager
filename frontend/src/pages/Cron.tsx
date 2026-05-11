import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import {
  getCron,
  addCronEntry,
  updateCronEntry,
  deleteCronEntry,
  validateCron,
  type CronEntry,
} from '../services/api';
import Modal from '../components/ui/Modal';
import FormField, { TextInput } from '../components/ui/FormField';
import { ConfirmPopover } from '../components/ui/InlinePopover';
import { useToast } from '../components/ui/Toast';
import { CRON_PRESETS, describeCron } from '../utils/cronPresets';

export default function Cron() {
  const [user, setUser] = useState<'current' | 'root'>('current');
  const fetchCron = useCallback(() => getCron(user), [user]);
  const { data, error, refetch } = usePolling(fetchCron, 30000);

  const [editEntry, setEditEntry] = useState<CronEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();

  const handleDelete = async (index: number) => {
    try {
      await deleteCronEntry(index, user);
      toast.success('Entry removed');
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Delete failed', msg);
    }
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">Scheduled Tasks (Cron)</h2>
          <p className="text-body-md text-on-surface-variant">Crontab entries with next-run preview.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-outline-variant rounded-sm overflow-hidden">
            <button
              onClick={() => setUser('current')}
              className={`px-3 py-1.5 text-data-md ${user === 'current' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
            >
              Current user
            </button>
            <button
              onClick={() => setUser('root')}
              className={`px-3 py-1.5 text-data-md ${user === 'root' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
            >
              root
            </button>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> Add entry
          </button>
        </div>
      </div>

      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="border-b border-outline-variant bg-surface-container-highest">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Schedule</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Command</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Next runs</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {error && (
                <tr><td colSpan={4} className="py-6 text-center text-error">{error}</td></tr>
              )}
              {!error && (data?.entries ?? []).length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-on-surface-variant">No crontab entries</td></tr>
              )}
              {(data?.entries ?? []).map((e: CronEntry) => (
                <CronRow
                  key={e.index}
                  entry={e}
                  onEdit={() => setEditEntry(e)}
                  onDelete={() => handleDelete(e.index)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CronModal
        open={createOpen}
        user={user}
        onClose={() => setCreateOpen(false)}
        onSave={async (entry) => {
          try {
            await addCronEntry({ ...entry, user });
            toast.success('Cron entry added');
            await refetch();
            setCreateOpen(false);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'failed';
            toast.error('Add failed', msg);
            throw err;
          }
        }}
      />

      <CronModal
        open={!!editEntry}
        user={user}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSave={async (input) => {
          if (!editEntry) return;
          try {
            await updateCronEntry(editEntry.index, { ...input, user });
            toast.success('Cron entry updated');
            await refetch();
            setEditEntry(null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'failed';
            toast.error('Update failed', msg);
            throw err;
          }
        }}
      />
    </div>
  );
}

function CronRow({ entry, onEdit, onDelete }: { entry: CronEntry; onEdit: () => void; onDelete: () => void }) {
  const delBtnRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <tr className="hover:bg-surface-container-highest/50 transition-colors group">
      <td className="py-3 px-3 font-mono text-primary">
        {entry.expression}
        <div className="text-label-xs text-on-surface-variant/80 font-sans normal-case">
          {describeCron(entry.minute, entry.hour, entry.dom, entry.month, entry.dow)}
        </div>
      </td>
      <td className="py-3 px-3 font-mono text-on-surface-variant truncate max-w-[400px]">{entry.command}</td>
      <td className="py-3 px-3 text-on-surface-variant text-label-xs">
        {(entry.next_runs || []).slice(0, 3).map((nr, i) => (
          <div key={i}>{new Date(nr).toLocaleString()}</div>
        ))}
      </td>
      <td className="py-3 px-3 text-right">
        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1 text-on-surface-variant hover:text-primary" title="Edit">
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button ref={delBtnRef} onClick={() => setConfirm(true)} className="p-1 text-on-surface-variant hover:text-error" title="Remove">
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
          <ConfirmPopover
            open={confirm}
            anchorRef={delBtnRef}
            message="Remove this cron entry?"
            onCancel={() => setConfirm(false)}
            onConfirm={() => { setConfirm(false); onDelete(); }}
          />
        </div>
      </td>
    </tr>
  );
}

function CronModal({
  open, user, entry, onClose, onSave,
}: {
  open: boolean;
  user: string;
  entry?: CronEntry | null;
  onClose: () => void;
  onSave: (input: { minute: string; hour: string; dom: string; month: string; dow: string; command: string }) => Promise<void>;
}) {
  const [minute, setMinute] = useState('*');
  const [hour, setHour] = useState('*');
  const [dom, setDom] = useState('*');
  const [month, setMonth] = useState('*');
  const [dow, setDow] = useState('*');
  const [command, setCommand] = useState('');
  const [valid, setValid] = useState<{ valid: boolean; next_runs?: string[]; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMinute(entry?.minute ?? '*');
      setHour(entry?.hour ?? '*');
      setDom(entry?.dom ?? '*');
      setMonth(entry?.month ?? '*');
      setDow(entry?.dow ?? '*');
      setCommand(entry?.command ?? '');
      setError(null);
      setValid(null);
    }
  }, [open, entry]);

  const validate = async () => {
    try {
      const res = await validateCron({ minute, hour, dom, month, dow });
      if (res.data.success) setValid(res.data.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(validate, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, hour, dom, month, dow, open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ minute, hour, dom, month, dow, command });
    } catch (err: any) {
      setError(err?.response?.data?.detail?.error || err?.message || 'Failed');
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      title={entry ? 'Edit cron entry' : `Add cron entry (${user})`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">Cancel</button>
          <button
            onClick={submit}
            disabled={!command || busy || (valid?.valid === false)}
            className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <FormField label="Preset" hint="Pick a common schedule to fill the fields">
        <select
          className="bg-surface-container-low border border-outline-variant px-3 py-1.5 text-data-md text-on-surface focus:outline-none focus:border-primary rounded-sm"
          value=""
          onChange={(e) => {
            const p = CRON_PRESETS.find((x) => x.label === e.target.value);
            if (p) {
              setMinute(p.minute); setHour(p.hour); setDom(p.dom); setMonth(p.month); setDow(p.dow);
            }
          }}
        >
          <option value="">— pick a preset —</option>
          {CRON_PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-5 gap-2">
        <FormField label="Minute"><TextInput value={minute} onChange={(e) => setMinute(e.target.value)} /></FormField>
        <FormField label="Hour"><TextInput value={hour} onChange={(e) => setHour(e.target.value)} /></FormField>
        <FormField label="DoM"><TextInput value={dom} onChange={(e) => setDom(e.target.value)} /></FormField>
        <FormField label="Month"><TextInput value={month} onChange={(e) => setMonth(e.target.value)} /></FormField>
        <FormField label="DoW"><TextInput value={dow} onChange={(e) => setDow(e.target.value)} /></FormField>
      </div>
      <div className="text-data-md text-on-surface-variant mb-2 italic">{describeCron(minute, hour, dom, month, dow)}</div>
      <FormField label="Command" error={error || undefined}>
        <TextInput value={command} onChange={(e) => setCommand(e.target.value)} placeholder="/usr/local/bin/backup.sh" />
      </FormField>
      {valid && !valid.valid && (
        <div className="text-error text-data-md">{valid.error}</div>
      )}
      {valid?.valid && valid.next_runs && (
        <div className="bg-surface-container-low p-3 rounded-sm text-data-md font-mono">
          <div className="text-label-xs text-on-surface-variant mb-1">Next runs</div>
          {valid.next_runs.slice(0, 5).map((nr, i) => (
            <div key={i} className="text-primary">{new Date(nr).toLocaleString()}</div>
          ))}
        </div>
      )}
    </Modal>
  );
}
