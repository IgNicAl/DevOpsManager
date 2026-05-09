interface StatusBadgeProps {
  status: string;
  variant?: 'active' | 'error' | 'warning' | 'inactive' | 'auto';
}

const STATUS_MAP: Record<string, { color: string; glow: string; bg: string }> = {
  active: { color: 'text-primary', glow: 'shadow-[0_0_8px_var(--color-primary)]', bg: 'bg-primary/10 border-primary' },
  running: { color: 'text-primary', glow: 'shadow-[0_0_8px_var(--color-primary)]', bg: 'bg-primary/10 border-primary' },
  healthy: { color: 'text-primary', glow: 'shadow-[0_0_8px_var(--color-primary)]', bg: 'bg-primary/10 border-primary' },
  synced: { color: 'text-primary', glow: 'shadow-[0_0_8px_var(--color-primary)]', bg: 'bg-primary/10 border-primary' },
  ready: { color: 'text-primary', glow: 'shadow-[0_0_8px_var(--color-primary)]', bg: 'bg-primary/10 border-primary' },
  online: { color: 'text-primary', glow: 'shadow-[0_0_8px_var(--color-primary)]', bg: 'bg-primary/10 border-primary' },
  completed: { color: 'text-primary', glow: '', bg: 'bg-primary/10 border-primary' },

  failed: { color: 'text-error', glow: 'pulse-error', bg: 'bg-error/10 border-error' },
  error: { color: 'text-error', glow: 'pulse-error', bg: 'bg-error/10 border-error' },
  crashloopbackoff: { color: 'text-error', glow: 'pulse-error', bg: 'bg-error/10 border-error' },
  degraded: { color: 'text-error', glow: 'pulse-error', bg: 'bg-error/10 border-error' },
  faulted: { color: 'text-error', glow: 'pulse-error', bg: 'bg-error/10 border-error' },
  notready: { color: 'text-error', glow: 'pulse-error', bg: 'bg-error/10 border-error' },

  outofsync: { color: 'text-tertiary-container', glow: '', bg: 'bg-tertiary-container/10 border-tertiary-container' },
  pending: { color: 'text-tertiary-container', glow: '', bg: 'bg-tertiary-container/10 border-tertiary-container' },
  progressing: { color: 'text-tertiary-container', glow: '', bg: 'bg-tertiary-container/10 border-tertiary-container' },
  warning: { color: 'text-tertiary-container', glow: '', bg: 'bg-tertiary-container/10 border-tertiary-container' },

  inactive: { color: 'text-outline', glow: '', bg: 'border-outline' },
  stopped: { color: 'text-outline', glow: '', bg: 'border-outline' },
  exited: { color: 'text-outline', glow: '', bg: 'border-outline' },
  unknown: { color: 'text-outline', glow: '', bg: 'border-outline' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/[\s_-]/g, '');
  const style = STATUS_MAP[key] || STATUS_MAP['unknown'];

  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 border text-label-xs tracking-wider rounded-sm ${style.bg} ${style.color} ${style.glow}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${style.color.replace('text-', 'bg-')}`} />
      {status}
    </span>
  );
}
