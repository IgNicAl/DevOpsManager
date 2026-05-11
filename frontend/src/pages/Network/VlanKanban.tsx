import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { usePolling } from '../../hooks/usePolling';
import {
  getNetworkVlans,
  getVlanMembers,
  addVlanMember,
  updateVlanMember,
  deleteVlanMember,
  createVlan,
  deleteVlan,
  type VlanMember,
} from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { ConfirmPopover } from '../../components/ui/InlinePopover';
import EditableText from '../../components/ui/EditableText';
import FormField, { TextInput } from '../../components/ui/FormField';
import { colorFor } from '../../utils/colorHash';

interface VlanColumnData {
  name: string;
  parent: string;
  vlan_id: number | null;
  members: VlanMember[];
  isReal: boolean; // true if returned by ip link (i.e. exists on host), false if only members reference it
}

export default function VlanKanban() {
  const fetchVlans = useCallback(() => getNetworkVlans(), []);
  const fetchMembers = useCallback(() => getVlanMembers(), []);
  const { data: vlans, refetch: refetchVlans } = usePolling(fetchVlans, 30000);
  const { data: members, refetch: refetchMembers } = usePolling(fetchMembers, 15000);
  const toast = useToast();
  const [draft, setDraft] = useState<{ parent: string; vlan_id: string; name: string } | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const columns: VlanColumnData[] = useMemo(() => {
    const map = new Map<string, VlanColumnData>();
    for (const v of vlans ?? []) {
      map.set(v.name, { name: v.name, parent: v.parent, vlan_id: v.vlan_id, members: [], isReal: true });
    }
    for (const m of members ?? []) {
      if (!map.has(m.vlan)) {
        map.set(m.vlan, { name: m.vlan, parent: '', vlan_id: null, members: [], isReal: false });
      }
      map.get(m.vlan)!.members.push(m);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [vlans, members]);

  const handleDragStart = (ev: DragStartEvent) => setDraggingId(String(ev.active.id));
  const handleDragEnd = async (ev: DragEndEvent) => {
    setDraggingId(null);
    if (!ev.over) return;
    const memberId = String(ev.active.id);
    const targetVlan = String(ev.over.id);
    const member = (members ?? []).find((m) => m.id === memberId);
    if (!member || member.vlan === targetVlan) return;
    try {
      await updateVlanMember(memberId, { vlan: targetVlan });
      toast.success(`Moved “${member.name}” to ${targetVlan}`);
      refetchMembers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'move failed';
      toast.error('Could not move member', msg);
    }
  };

  const handleCreateDraft = async () => {
    if (!draft) return;
    const id = parseInt(draft.vlan_id, 10);
    if (!draft.parent || !id) {
      toast.error('Parent and VLAN id required');
      return;
    }
    setDraftBusy(true);
    try {
      const res = await createVlan(draft.parent, id, draft.name || undefined);
      if (res.data.success) {
        toast.success('VLAN created');
        setDraft(null);
        refetchVlans();
      } else {
        toast.error('VLAN creation failed', res.data.error || undefined);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('VLAN creation failed', msg);
    }
    setDraftBusy(false);
  };

  const handleDeleteVlan = async (name: string) => {
    try {
      await deleteVlan(name);
      toast.success(`Removed VLAN ${name}`);
      refetchVlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Delete failed', msg);
    }
  };

  const draggingMember = draggingId ? (members ?? []).find((m) => m.id === draggingId) : null;

  return (
    <div className="surface-card border border-outline-variant rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-label-xs text-on-surface-variant tracking-wider mb-1">VLAN Topology</h3>
          <p className="text-label-xs text-on-surface-variant/70">Drag member cards between columns to reassign.</p>
        </div>
        <button
          onClick={() => setDraft({ parent: '', vlan_id: '', name: '' })}
          className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> Add VLAN column
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: '320px' }}>
          {columns.map((col) => (
            <VlanColumn
              key={col.name}
              column={col}
              onAddMember={async (input) => {
                try {
                  await addVlanMember({ ...input, vlan: col.name });
                  toast.success(`Added ${input.name} to ${col.name}`);
                  refetchMembers();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'failed';
                  toast.error('Add failed', msg);
                }
              }}
              onUpdateMember={async (id, fields) => {
                try {
                  await updateVlanMember(id, fields);
                  toast.success('Updated');
                  refetchMembers();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'failed';
                  toast.error('Update failed', msg);
                }
              }}
              onDeleteMember={async (id) => {
                try {
                  await deleteVlanMember(id);
                  toast.success('Member removed');
                  refetchMembers();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'failed';
                  toast.error('Delete failed', msg);
                }
              }}
              onDeleteVlan={() => handleDeleteVlan(col.name)}
            />
          ))}
          {draft && (
            <div
              className="w-72 flex-shrink-0 surface-card border-2 border-dashed border-primary rounded p-3"
              style={{ minHeight: '280px' }}
            >
              <div className="text-label-xs text-primary mb-3">DRAFT — new VLAN</div>
              <FormField label="Parent interface"><TextInput value={draft.parent} onChange={(e) => setDraft({ ...draft, parent: e.target.value })} placeholder="eth0" /></FormField>
              <FormField label="VLAN id (1-4094)"><TextInput type="number" value={draft.vlan_id} onChange={(e) => setDraft({ ...draft, vlan_id: e.target.value })} /></FormField>
              <FormField label="Custom name (optional)"><TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Default: {parent}.{id}" /></FormField>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setDraft(null)} className="flex-1 px-3 py-1.5 text-label-xs border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">Cancel</button>
                <button
                  onClick={handleCreateDraft}
                  disabled={!draft.parent || !draft.vlan_id || draftBusy}
                  className="flex-1 px-3 py-1.5 text-label-xs bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
                >
                  {draftBusy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingMember && <MemberCardView member={draggingMember} dragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function VlanColumn({ column, onAddMember, onUpdateMember, onDeleteMember, onDeleteVlan }: {
  column: VlanColumnData;
  onAddMember: (input: { name: string; ip?: string; mac?: string; note?: string }) => Promise<void>;
  onUpdateMember: (id: string, fields: Partial<Omit<VlanMember, 'id'>>) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  onDeleteVlan: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.name });
  const colors = colorFor(column.name);
  const [addingMember, setAddingMember] = useState(false);
  const [memName, setMemName] = useState('');
  const [memIp, setMemIp] = useState('');
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 rounded flex flex-col transition-all duration-150 ${
        isOver ? 'ring-2 ring-primary scale-[1.01]' : ''
      }`}
      style={{
        background: isOver ? `${colors.bg}33` : colors.bg + '14',
        border: `1px solid ${colors.border}66`,
        minHeight: '280px',
      }}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: `${colors.border}55` }}>
        <div>
          <div className="text-data-md font-bold" style={{ color: colors.fg }}>{column.name}</div>
          <div className="text-label-xs" style={{ color: `${colors.fg}aa` }}>
            {column.isReal ? (
              <>parent {column.parent || '?'} · vlan {column.vlan_id ?? '?'}</>
            ) : (
              <>logical (no interface)</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAddingMember((s) => !s)}
            className="p-1 rounded hover:bg-surface-container-highest"
            title="Add member"
            style={{ color: colors.fg }}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          {column.isReal && (
            <>
              <button
                ref={deleteBtnRef}
                onClick={() => setConfirmDelete(true)}
                className="p-1 rounded hover:bg-error-container/30"
                title="Remove VLAN"
                style={{ color: colors.fg }}
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
              <ConfirmPopover
                open={confirmDelete}
                anchorRef={deleteBtnRef}
                message={`Remove VLAN ${column.name}? Linked members stay.`}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => { setConfirmDelete(false); onDeleteVlan(); }}
              />
            </>
          )}
        </div>
      </div>

      <div className="p-2 flex flex-col gap-2 flex-1">
        {addingMember && (
          <div className="surface-card border border-primary rounded-sm p-2">
            <input
              autoFocus
              className="bg-surface-container-low border border-outline-variant px-2 py-1 text-data-md text-on-surface w-full mb-1 terminal-focus"
              placeholder="Name (e.g. laptop)"
              value={memName}
              onChange={(e) => setMemName(e.target.value)}
            />
            <input
              className="bg-surface-container-low border border-outline-variant px-2 py-1 text-data-md text-on-surface w-full mb-2 terminal-focus"
              placeholder="IP (optional)"
              value={memIp}
              onChange={(e) => setMemIp(e.target.value)}
            />
            <div className="flex gap-1">
              <button onClick={() => { setAddingMember(false); setMemName(''); setMemIp(''); }} className="flex-1 px-2 py-1 text-label-xs border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest">Cancel</button>
              <button
                onClick={async () => {
                  if (!memName) return;
                  await onAddMember({ name: memName, ip: memIp || undefined });
                  setAddingMember(false);
                  setMemName('');
                  setMemIp('');
                }}
                disabled={!memName}
                className="flex-1 px-2 py-1 text-label-xs bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {column.members.length === 0 && !addingMember && (
          <div className="text-label-xs text-on-surface-variant/60 text-center py-6">
            Drop members here
          </div>
        )}

        {column.members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            onRename={(name) => onUpdateMember(m.id, { name })}
            onChangeIp={(ip) => onUpdateMember(m.id, { ip })}
            onDelete={() => onDeleteMember(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MemberCardView({ member, dragging }: { member: VlanMember; dragging?: boolean }) {
  const colors = colorFor(member.vlan);
  return (
    <div
      className={`surface-card rounded-sm px-2 py-1.5 text-data-md ${dragging ? 'shadow-2xl rotate-1 cursor-grabbing' : ''}`}
      style={{ borderLeft: `3px solid ${colors.border}` }}
    >
      <div className="font-bold text-on-surface truncate">{member.name}</div>
      {member.ip && <div className="text-label-xs text-on-surface-variant font-mono">{member.ip}</div>}
    </div>
  );
}

function MemberCard({ member, onRename, onChangeIp, onDelete }: {
  member: VlanMember;
  onRename: (name: string) => Promise<void>;
  onChangeIp: (ip: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const colors = colorFor(member.vlan);
  const delBtnRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeft: `3px solid ${colors.border}`, opacity: isDragging ? 0.4 : 1 }}
      className="surface-card border border-outline-variant rounded-sm px-2 py-1.5 cursor-grab active:cursor-grabbing group"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-on-surface text-data-md truncate">
            <EditableText value={member.name} onSave={onRename} />
          </div>
          <div className="text-label-xs text-on-surface-variant font-mono">
            <EditableText value={member.ip || ''} placeholder="set ip" onSave={onChangeIp} />
          </div>
        </div>
        <button
          ref={delBtnRef}
          onClick={(e) => { e.stopPropagation(); setConfirm(true); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error p-0.5"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
        <ConfirmPopover
          open={confirm}
          anchorRef={delBtnRef}
          message={`Remove “${member.name}”?`}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => { setConfirm(false); await onDelete(); }}
        />
      </div>
    </div>
  );
}
