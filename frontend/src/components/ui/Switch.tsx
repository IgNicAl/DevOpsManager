interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export default function Switch({ checked, onChange, disabled, loading, size = 'md', ariaLabel }: Props) {
  const dims = size === 'sm' ? { w: 30, h: 16, knob: 12 } : { w: 40, h: 22, knob: 18 };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`relative inline-flex items-center transition-colors rounded-full border ${
        checked ? 'bg-primary-container border-primary' : 'bg-surface-container-highest border-outline-variant'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ width: dims.w, height: dims.h }}
    >
      <span
        className={`absolute top-0.5 bottom-0.5 rounded-full transition-transform flex items-center justify-center ${
          checked ? 'bg-primary' : 'bg-outline'
        }`}
        style={{ width: dims.knob, transform: `translateX(${checked ? dims.w - dims.knob - 4 : 2}px)` }}
      >
        {loading && <span className="material-symbols-outlined animate-spin text-on-primary" style={{ fontSize: dims.knob - 4 }}>progress_activity</span>}
      </span>
    </button>
  );
}
