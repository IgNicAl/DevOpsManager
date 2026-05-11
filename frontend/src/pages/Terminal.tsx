import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { usePolling } from '../hooks/usePolling';
import { getTerminalStatus, getTerminalHistory } from '../services/api';
import { openWebSocket } from '../services/ws';

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchStatus = useCallback(() => getTerminalStatus(), []);
  const fetchHistory = useCallback(() => getTerminalHistory(100), []);
  const { data: status } = usePolling(fetchStatus, 30000);
  const { data: history } = usePolling(fetchHistory, 30000);

  const [token, setToken] = useState(() => (import.meta as any).env?.VITE_TERMINAL_TOKEN || '');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 13,
      theme: {
        background: '#0e150d',
        foreground: '#dce5d6',
        cursor: '#5bf06c',
        cursorAccent: '#0e150d',
        black: '#0e150d',
        green: '#5bf06c',
        red: '#ffb4ab',
        yellow: '#ffc7c0',
        blue: '#bccbb6',
        white: '#dce5d6',
        brightWhite: '#ffffff',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
      const ws = wsRef.current;
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  const connect = () => {
    if (!termRef.current || !token) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    setError(null);
    const ws = openWebSocket('/api/terminal/ws', { token });
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const term = termRef.current!;
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      term.writeln('\x1b[32m[connected]\x1b[0m');
    };
    ws.onmessage = (ev) => {
      termRef.current?.write(typeof ev.data === 'string' ? ev.data : '');
    };
    ws.onclose = (ev) => {
      setConnected(false);
      termRef.current?.writeln(`\r\n\x1b[31m[disconnected: ${ev.reason || ev.code}]\x1b[0m`);
    };
    ws.onerror = () => {
      setError('WebSocket error');
    };

    const term = termRef.current;
    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
  };

  const available = status?.available;

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface mb-1">Terminal</h2>
          <p className="text-body-md text-on-surface-variant">
            Restricted shell (rbash) over WebSocket. Requires <code className="font-mono">TERMINAL_TOKEN</code> on the server.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="bg-surface-container-low border border-outline-variant text-on-surface text-data-md py-1.5 px-3 w-64 terminal-focus"
            placeholder="TERMINAL_TOKEN"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={connected}
            type="password"
          />
          {!connected ? (
            <button
              onClick={connect}
              disabled={!token || !available}
              className="px-3 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span> Connect
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-3 py-1.5 text-data-md bg-error-container text-on-error-container hover:bg-error flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">stop</span> Disconnect
            </button>
          )}
        </div>
      </div>

      {available === false && (
        <div className="surface-card border border-tertiary-container rounded p-3 text-data-md text-tertiary-container">
          Terminal not available. Set the <code className="font-mono">TERMINAL_TOKEN</code> env var on the backend.
        </div>
      )}

      {error && <div className="text-error text-data-md">{error}</div>}

      <div className="surface-card border border-outline-variant rounded p-2 flex-1" style={{ minHeight: '500px' }}>
        <div ref={containerRef} className="w-full h-full" style={{ minHeight: '480px' }} />
      </div>

      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
          <span className="text-label-xs text-on-surface-variant tracking-wider">Session history</span>
        </div>
        <div className="overflow-auto max-h-64">
          <table className="w-full text-left border-collapse">
            <thead className="border-b border-outline-variant bg-surface-container-highest sticky top-0">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Time</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Session</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Event</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Bytes in/out</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(history ?? []).length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-on-surface-variant">No history</td></tr>
              )}
              {[...(history ?? [])].reverse().map((h: any, i: number) => (
                <tr key={i}>
                  <td className="py-2 px-3 text-on-surface-variant font-mono text-label-xs">{new Date(h.ts * 1000).toLocaleString()}</td>
                  <td className="py-2 px-3 font-mono text-primary">{h.session}</td>
                  <td className="py-2 px-3 text-on-surface-variant uppercase">{h.event}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{h.bytes_in != null ? `${h.bytes_in} / ${h.bytes_out}` : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
