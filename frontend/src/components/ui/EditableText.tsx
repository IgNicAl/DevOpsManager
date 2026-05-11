import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
  placeholder?: string;
  trigger?: 'click' | 'dblclick';
  selectAllOnEdit?: boolean;
  validate?: (next: string) => string | null;
  inputType?: 'text' | 'number';
}

export default function EditableText({ value, onSave, className = '', placeholder, trigger = 'dblclick', selectAllOnEdit = true, validate, inputType = 'text' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (selectAllOnEdit) inputRef.current.select();
    }
  }, [editing, selectAllOnEdit]);

  const commit = async () => {
    const next = draft.trim();
    if (next === value) { setEditing(false); return; }
    if (validate) {
      const err = validate(next);
      if (err) { setError(err); return; }
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err: unknown) {
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: string }).message) : 'Failed';
      setError(msg);
    }
    setBusy(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
    setError(null);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type={inputType}
          className={`bg-surface-container-low border ${error ? 'border-error' : 'border-primary'} px-1 py-0.5 text-data-md text-on-surface focus:outline-none rounded-sm min-w-0 ${className}`}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          onBlur={() => { if (!busy) commit(); }}
          disabled={busy}
        />
        {busy && <span className="material-symbols-outlined animate-spin text-[14px] text-on-surface-variant">progress_activity</span>}
        {error && <span className="text-label-xs text-error">{error}</span>}
      </span>
    );
  }

  return (
    <span
      onClick={(e) => { if (trigger === 'click') { e.stopPropagation(); setEditing(true); } }}
      onDoubleClick={(e) => { if (trigger === 'dblclick') { e.stopPropagation(); setEditing(true); } }}
      title={trigger === 'dblclick' ? 'Double-click to edit' : 'Click to edit'}
      className={`cursor-text inline-flex items-center gap-1 hover:bg-surface-container-highest/60 rounded-sm px-1 -mx-1 ${className}`}
    >
      <span>{value || <span className="text-on-surface-variant/50 italic">{placeholder || 'empty'}</span>}</span>
    </span>
  );
}
