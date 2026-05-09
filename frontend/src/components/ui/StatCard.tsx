interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subValue?: string;
  icon: string;
  percent?: number;
  color?: 'primary' | 'tertiary-container' | 'error' | 'on-surface';
}

export default function StatCard({ label, value, unit, subValue, icon, percent, color = 'primary' }: StatCardProps) {
  const colorClass = `text-${color}`;
  const bgClass = `bg-${color}`;

  return (
    <div className="surface-card border border-outline-variant rounded flex flex-col relative overflow-hidden">
      <div className="p-3 pb-6 flex-1 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <span className="text-label-xs text-on-surface-variant">{label}</span>
          <span className="material-symbols-outlined text-on-surface-variant text-sm">{icon}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <div className={`data-display ${colorClass}`}>
            {value}
            {unit && <span className="text-2xl text-on-surface-variant">{unit}</span>}
          </div>
          {subValue && <div className="text-data-md text-on-surface-variant">{subValue}</div>}
        </div>
      </div>
      {percent !== undefined && (
        <div className="progress-track w-full absolute bottom-0 left-0">
          <div className={`h-full ${bgClass} transition-all duration-500`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      )}
    </div>
  );
}
