import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getSystemLogs, logsExportSystemUrl } from '../services/api';
import { openSSE } from '../services/sse';

type Level = 'ALL' | 'ERROR' | 'WARN' | 'INFO';

const LEVEL_RX: Record<Level, RegExp | null> = {
  ALL: null,
  ERROR: /\b(error|err|critical|crit|fatal|alert|emerg)\b/i,
  WARN: /\b(warn|warning|notice)\b/i,
  INFO: /\b(info|debug|trace)\b/i,
};

function classifyLine(line: string): 'error' | 'warn' | 'info' | 'plain' {
  if (LEVEL_RX.ERROR!.test(line)) return 'error';
  if (LEVEL_RX.WARN!.test(line)) return 'warn';
  if (LEVEL_RX.INFO!.test(line)) return 'info';
  return 'plain';
}

export default function Logs() {
  const [lines, setLinesCount] = useState(100);
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState<Level>('ALL');
  const [tailing, setTailing] = useState(false);
  const [tailLines, setTailLines] = useState<string[]>([]);
  const tailContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(
    () => getSystemLogs(lines, filter || undefined, level === 'ALL' ? undefined : level),
    [lines, filter, level],
  );
  const { data: logData } = usePolling(fetchLogs, tailing ? 60000 : 10000);

  const polledLines: string[] = (logData?.lines as string[]) ?? [];

  useEffect(() => {
    if (!tailing) {
      setTailLines([]);
      return;
    }
    const params = new URLSearchParams();
    if (level !== 'ALL') params.set('level', level);
    const path = `/api/logs/system/stream${params.toString() ? '?' + params.toString() : ''}`;
    const es = openSSE(path, {
      events: ['log', 'error'],
      onMessage: (event, data: any) => {
        if (event === 'log' && data?.line != null) {
          setTailLines((prev) => {
            const next = [...prev, data.line as string];
            return next.length > 1000 ? next.slice(-1000) : next;
          });
        }
      },
    });
    return () => es.close();
  }, [tailing, level]);

  useEffect(() => {
    if (tailing && tailContainerRef.current) {
      tailContainerRef.current.scrollTop = tailContainerRef.current.scrollHeight;
    }
  }, [tailLines, tailing]);

  const displayLines = tailing ? tailLines : polledLines;

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">System Logs</h2>
          <p className="text-body-md text-on-surface-variant">Live system log viewer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="bg-surface-container-highest border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 px-3 w-48 terminal-focus placeholder:text-on-surface-variant/50"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={tailing}
          />
          <select
            className="bg-surface border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 pl-3 pr-8 terminal-focus"
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
          >
            <option value="ALL">Level: All</option>
            <option value="ERROR">Level: ERROR</option>
            <option value="WARN">Level: WARN</option>
            <option value="INFO">Level: INFO</option>
          </select>
          <select
            className="bg-surface border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 pl-3 pr-8 terminal-focus"
            value={lines}
            onChange={(e) => setLinesCount(Number(e.target.value))}
            disabled={tailing}
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
            <option value={500}>500 lines</option>
          </select>
          <button
            onClick={() => setTailing((t) => !t)}
            className={`px-3 py-1.5 text-data-md flex items-center gap-2 transition-colors ${
              tailing
                ? 'bg-error-container text-on-error-container hover:bg-error'
                : 'bg-primary-container text-on-primary-container hover:bg-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tailing ? 'pause' : 'play_arrow'}</span>
            {tailing ? 'Stop tail' : 'Tail (live)'}
          </button>
          <a
            href={logsExportSystemUrl(Math.max(lines, 1000), filter || undefined, level)}
            className="px-3 py-1.5 text-data-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            download
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export
          </a>
        </div>
      </div>

      <div className="surface-card border border-outline-variant rounded overflow-hidden flex flex-col flex-1">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant text-sm">terminal</span>
          <span className="text-label-xs text-on-surface-variant">{tailing ? 'journalctl -f (live)' : 'journalctl'}</span>
          {tailing && (
            <span className="ml-auto text-label-xs text-primary flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary pulse-active" />
              streaming
            </span>
          )}
        </div>
        <div ref={tailContainerRef} className="overflow-auto p-4 font-mono text-sm flex-1" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {displayLines.map((line, i) => {
            const cls = classifyLine(line);
            const colorClass =
              cls === 'error' ? 'text-error' :
              cls === 'warn' ? 'text-tertiary-container' :
              cls === 'info' ? 'text-on-surface' :
              'text-on-surface-variant';
            return (
              <div key={i} className={`${colorClass} hover:bg-surface-container-highest/50 px-1 transition-colors whitespace-pre`}>
                <span className="text-outline mr-3 select-none">{String(i + 1).padStart(4, ' ')}</span>
                {line}
              </div>
            );
          })}
          {displayLines.length === 0 && <div className="text-outline italic">No log entries</div>}
        </div>
      </div>
    </div>
  );
}
