import { useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getSystemLogs } from '../services/api';
import TerminalViewer from '../components/ui/TerminalViewer';

export default function Logs() {
  const [lines, setLines] = useState(100);
  const [filter, setFilter] = useState('');
  const fetchLogs = useCallback(() => getSystemLogs(lines, filter || undefined), [lines, filter]);
  const { data: logData } = usePolling(fetchLogs, 10000);

  const logLines: string[] = logData?.lines ?? (typeof logData === 'string' ? logData.split('\n') : []);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">System Logs</h2>
          <p className="text-body-md text-on-surface-variant">Live system log viewer.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="bg-surface-container-highest border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 px-3 w-48 terminal-focus placeholder:text-on-surface-variant/50"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="bg-surface border border-outline-variant text-on-surface text-data-md rounded-none py-1.5 pl-3 pr-8 terminal-focus"
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
            <option value={500}>500 lines</option>
          </select>
        </div>
      </div>
      <TerminalViewer lines={logLines} title="journalctl" maxHeight="calc(100vh - 200px)" />
    </div>
  );
}
