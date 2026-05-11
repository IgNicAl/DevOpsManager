import { useCallback, useEffect, useMemo, useState } from 'react';
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
  getDockerContainers,
  getDockerNetworks,
  inspectDockerContainer,
  connectContainerToNetwork,
  disconnectContainerFromNetwork,
} from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { colorFor } from '../../utils/colorHash';

interface ContainerNets {
  id: string;
  name: string;
  image: string;
  status: string;
  networks: string[];
}

export default function NetworkTopology() {
  const fetchContainers = useCallback(() => getDockerContainers(), []);
  const fetchNetworks = useCallback(() => getDockerNetworks(), []);
  const { data: containers, refetch: refetchContainers } = usePolling(fetchContainers, 15000);
  const { data: networks } = usePolling(fetchNetworks, 30000);
  const toast = useToast();
  const [containerNets, setContainerNets] = useState<Record<string, string[]>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Inspect each container to know its networks (refreshed when container list changes)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string[]> = {};
      for (const c of containers ?? []) {
        try {
          const res = await inspectDockerContainer(c.id);
          if (res.data.success && res.data.data?.networks) {
            next[c.id] = Object.keys(res.data.data.networks);
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled) setContainerNets(next);
    })();
    return () => { cancelled = true; };
  }, [containers]);

  const containerNetMap: ContainerNets[] = useMemo(() => {
    return (containers ?? []).map((c: { id: string; name: string; image: string; status: string }) => ({
      id: c.id,
      name: c.name,
      image: c.image,
      status: c.status,
      networks: containerNets[c.id] ?? [],
    }));
  }, [containers, containerNets]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (ev: DragStartEvent) => setDraggingId(String(ev.active.id));

  const handleDragEnd = async (ev: DragEndEvent) => {
    setDraggingId(null);
    if (!ev.over) return;
    const containerId = String(ev.active.id);
    const targetNetwork = String(ev.over.id);
    const container = containerNetMap.find((c) => c.id === containerId);
    if (!container) return;
    if (container.networks.includes(targetNetwork)) {
      toast.info(`${container.name} already on ${targetNetwork}`);
      return;
    }
    try {
      // Connect to target; optionally disconnect from other networks (we only connect — multi-attach is valid)
      await connectContainerToNetwork(targetNetwork, containerId);
      toast.success(`Connected ${container.name} to ${targetNetwork}`);
      // refresh
      const res = await inspectDockerContainer(containerId);
      if (res.data.success && res.data.data?.networks) {
        setContainerNets((curr) => ({ ...curr, [containerId]: Object.keys(res.data.data.networks) }));
      }
      refetchContainers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Could not attach', msg);
    }
  };

  const handleDetach = async (containerId: string, network: string, containerName: string) => {
    try {
      await disconnectContainerFromNetwork(network, containerId);
      toast.success(`Detached ${containerName} from ${network}`);
      const res = await inspectDockerContainer(containerId);
      if (res.data.success && res.data.data?.networks) {
        setContainerNets((curr) => ({ ...curr, [containerId]: Object.keys(res.data.data.networks) }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      toast.error('Could not detach', msg);
    }
  };

  const draggingContainer = draggingId ? containerNetMap.find((c) => c.id === draggingId) : null;

  return (
    <div className="surface-card border border-outline-variant rounded p-4">
      <div className="text-label-xs text-on-surface-variant mb-3">
        Drag a container card onto a network to attach. Use the unlink icon to detach.
      </div>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: '300px' }}>
          {(networks ?? []).map((n: { name: string; driver: string; subnets: string[] }) => (
            <NetworkColumn
              key={n.name}
              network={n}
              containers={containerNetMap.filter((c) => c.networks.includes(n.name))}
              onDetach={handleDetach}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingContainer && <ContainerCardView container={draggingContainer} dragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function NetworkColumn({ network, containers, onDetach }: {
  network: { name: string; driver: string; subnets: string[] };
  containers: ContainerNets[];
  onDetach: (containerId: string, network: string, containerName: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: network.name });
  const colors = colorFor(network.name);
  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 rounded flex flex-col transition-all duration-150 ${isOver ? 'ring-2 ring-primary scale-[1.01]' : ''}`}
      style={{
        background: isOver ? `${colors.bg}33` : colors.bg + '14',
        border: `1px solid ${colors.border}66`,
        minHeight: '260px',
      }}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: `${colors.border}55` }}>
        <div className="text-data-md font-bold" style={{ color: colors.fg }}>{network.name}</div>
        <div className="text-label-xs" style={{ color: `${colors.fg}aa` }}>
          {network.driver} · {(network.subnets ?? []).join(', ') || 'no subnet'}
        </div>
      </div>
      <div className="p-2 flex flex-col gap-1.5 flex-1">
        {containers.length === 0 ? (
          <div className="text-label-xs text-on-surface-variant/60 text-center py-6">No containers</div>
        ) : containers.map((c) => (
          <DraggableContainerCard key={c.id} container={c} onDetach={() => onDetach(c.id, network.name, c.name)} />
        ))}
      </div>
    </div>
  );
}

function DraggableContainerCard({ container, onDetach }: { container: ContainerNets; onDetach: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: container.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.4 : 1 } : { opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="surface-card border border-outline-variant rounded-sm px-2 py-1.5 cursor-grab active:cursor-grabbing group flex items-center gap-2"
      {...attributes}
      {...listeners}
    >
      <div className={`w-2 h-2 rounded-full ${container.status === 'running' ? 'bg-primary' : 'bg-outline'}`} />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-on-surface text-data-md truncate">{container.name}</div>
        <div className="text-label-xs text-on-surface-variant truncate">{container.image}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDetach(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error p-0.5"
        title="Detach from this network"
      >
        <span className="material-symbols-outlined text-[16px]">link_off</span>
      </button>
    </div>
  );
}

function ContainerCardView({ container, dragging }: { container: ContainerNets; dragging?: boolean }) {
  return (
    <div className={`surface-card border border-primary rounded-sm px-2 py-1.5 ${dragging ? 'shadow-2xl rotate-1' : ''}`}>
      <div className="font-bold text-on-surface text-data-md">{container.name}</div>
      <div className="text-label-xs text-on-surface-variant">{container.image}</div>
    </div>
  );
}
