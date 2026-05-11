interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subValue?: string;
  icon: string;
  percent?: number;
  color?: 'primary' | 'tertiary-container' | 'error' | 'on-surface';
  onClick?: () => void;
  expanded?: boolean;
  children?: React.ReactNode;
}

export default function StatCard({ label, value, unit, subValue, icon, percent, color = 'primary', onClick, expanded, children }: StatCardProps) {
  const colorClass = `text-${color}`;
  const bgClass = `bg-${color}`;
  const clickable = !!onClick;

  return (
    <div
      className={`surface-card border border-outline-variant rounded flex flex-col relative overflow-hidden transition-all ${
        clickable ? 'cursor-pointer hover:border-primary hover:shadow-lg' : ''
      } ${expanded ? 'border-primary shadow-lg' : ''}`}
      onClick={onClick}
    >
      <div className="p-3 pb-6 flex-1 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <span className="text-label-xs text-on-surface-variant">{label}</span>
          <span className="flex items-center gap-1">
            {clickable && (
              <span className="material-symbols-outlined text-on-surface-variant/50 text-sm">
                {expanded ? 'expand_less' : 'expand_more'}
              </span>
            )}
            <span className="material-symbols-outlined text-on-surface-variant text-sm">{icon}</span>
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <div className={`data-display ${colorClass}`}>
            {value}
            {unit && <span className="text-2xl text-on-surface-variant">{unit}</span>}
          </div>
          {subValue && <div className="text-data-md text-on-surface-variant">{subValue}</div>}
        </div>
      </div>
      {expanded && children && (
        <div onClick={(e) => e.stopPropagation()} className="border-t border-outline-variant px-3 py-3 bg-surface-container-low">
          {children}
        </div>
      )}
      {percent !== undefined && !expanded && (
        <div className="progress-track w-full absolute bottom-0 left-0">
          <div className={`h-full ${bgClass} transition-all duration-500`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      )}
    </div>
  );
}
