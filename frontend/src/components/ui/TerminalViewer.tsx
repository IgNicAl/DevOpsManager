interface TerminalViewerProps {
  lines: string[];
  title?: string;
  maxHeight?: string;
}

export default function TerminalViewer({ lines, title, maxHeight = '400px' }: TerminalViewerProps) {
  return (
    <div className="surface-card border border-outline-variant rounded overflow-hidden flex flex-col">
      {title && (
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant text-sm">terminal</span>
          <span className="text-label-xs text-on-surface-variant">{title}</span>
        </div>
      )}
      <div className="overflow-auto p-4 font-mono text-sm" style={{ maxHeight }}>
        {lines.map((line, i) => (
          <div key={i} className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/50 px-1 transition-colors whitespace-pre">
            <span className="text-outline mr-3 select-none">{String(i + 1).padStart(4, ' ')}</span>
            {line}
          </div>
        ))}
        {lines.length === 0 && <div className="text-outline italic">No log entries</div>}
      </div>
    </div>
  );
}
