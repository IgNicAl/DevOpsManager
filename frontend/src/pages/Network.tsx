import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import {
  getNetworkInterfaces,
  getNetworkRoutes,
  getNetworkConnections,
  getNetworkVlans,
  getTailscalePeers,
  getCloudflareTunnels,
  getNetworkMap,
  scanNetworkMap,
  networkPingUrl,
  networkTracerouteUrl,
} from '../services/api';
import type { NetworkMap, NetworkDevice } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import VlanKanban from './Network/VlanKanban';

export default function Network() {
  const fetchInterfaces = useCallback(() => getNetworkInterfaces(), []);
  const fetchRoutes = useCallback(() => getNetworkRoutes(), []);
  const fetchConns = useCallback(() => getNetworkConnections(), []);
  const fetchVlans = useCallback(() => getNetworkVlans(), []);
  const fetchPeers = useCallback(() => getTailscalePeers(), []);
  const fetchTunnels = useCallback(() => getCloudflareTunnels(), []);
  const fetchMap = useCallback(() => getNetworkMap(), []);

  const { data: interfaces } = usePolling(fetchInterfaces, 15000);
  const { data: routes } = usePolling(fetchRoutes, 30000);
  const { data: conns } = usePolling(fetchConns, 15000);
  const { data: vlans } = usePolling(fetchVlans, 30000);
  const { data: peers } = usePolling(fetchPeers, 15000);
  const { data: tunnels } = usePolling(fetchTunnels, 30000);
  const { data: networkMap, refetch: refetchMap } = usePolling(fetchMap, 30000);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Network</h2>
        <p className="text-body-md text-on-surface-variant">Interfaces, routes, connections, VLANs, Tailscale, Cloudflare.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        {[
          { label: 'Devices', count: networkMap?.devices?.length ?? 0 },
          { label: 'Interfaces', count: (interfaces ?? []).length },
          { label: 'Routes', count: (routes ?? []).length },
          { label: 'Connections', count: (conns ?? []).length },
          { label: 'VLANs', count: (vlans ?? []).length },
          { label: 'Peers', count: (peers ?? []).length },
          { label: 'Tunnels', count: (tunnels ?? []).length },
        ].map((s) => (
          <div key={s.label} className="surface-card border border-outline-variant rounded px-4 py-2 flex items-center gap-3">
            <span className="text-label-xs text-on-surface-variant">{s.label}</span>
            <span className="text-data-md text-on-surface">{s.count}</span>
          </div>
        ))}
      </div>

      <NetworkMapSection data={networkMap} onRefresh={refetchMap} />

      <Section title="Interfaces">
        <Table headers={['Name', 'IPv4', 'MAC', 'Status', 'Speed', 'MTU']} empty="No interfaces" data={interfaces ?? []}>
          {(iface: any) => (
            <tr key={iface.name} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3 font-bold text-primary">{iface.name}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{(iface.ipv4 || []).join(', ') || '--'}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{iface.mac || '--'}</td>
              <td className="py-3 px-3"><StatusBadge status={iface.is_up ? 'Active' : 'Inactive'} /></td>
              <td className="py-3 px-3 text-on-surface-variant">{iface.speed_mbps ? `${iface.speed_mbps} Mbps` : '--'}</td>
              <td className="py-3 px-3 text-on-surface-variant">{iface.mtu || '--'}</td>
            </tr>
          )}
        </Table>
      </Section>

      <Section title="Routes">
        <Table headers={['Destination', 'Gateway', 'Device', 'Proto', 'Scope']} empty="No routes" data={routes ?? []}>
          {(r: any, i: number) => (
            <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3 font-mono text-primary">{r.dst || '--'}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{r.gateway || '--'}</td>
              <td className="py-3 px-3 text-on-surface-variant">{r.dev || '--'}</td>
              <td className="py-3 px-3 text-on-surface-variant">{r.protocol || r.proto || '--'}</td>
              <td className="py-3 px-3 text-on-surface-variant">{r.scope || '--'}</td>
            </tr>
          )}
        </Table>
      </Section>

      <VlanKanban />

      <Section title="Open Connections (ss)">
        <Table headers={['Proto', 'State', 'Local', 'Remote', 'Process']} empty="No connections" data={conns ?? []}>
          {(c: any, i: number) => (
            <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3 font-mono text-primary">{c.proto}</td>
              <td className="py-3 px-3"><StatusBadge status={c.state} /></td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{c.local_address}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{c.remote_address}</td>
              <td className="py-3 px-3 text-on-surface-variant">{c.process ? `${c.process.name} (${c.process.pid})` : '--'}</td>
            </tr>
          )}
        </Table>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <NetTool title="Ping" url={networkPingUrl()} placeholder="example.com" buildBody={(host) => ({ host, count: 4 })} />
        <NetTool title="Traceroute" url={networkTracerouteUrl()} placeholder="example.com" buildBody={(host) => ({ host, max_hops: 20 })} />
      </div>

      <Section title="Tailscale Peers">
        <Table headers={['Name', 'IP', 'OS', 'Status']} empty="No peers" data={peers ?? []}>
          {(peer: any, i: number) => (
            <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3 font-bold text-primary">{peer.name || '--'}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{peer.ip || '--'}</td>
              <td className="py-3 px-3 text-on-surface-variant">{peer.os || '--'}</td>
              <td className="py-3 px-3"><StatusBadge status={peer.online ? 'Online' : 'Offline'} /></td>
            </tr>
          )}
        </Table>
      </Section>

      <Section title="Cloudflare Tunnels">
        <Table headers={['Name', 'ID', 'Status', 'Connections']} empty="No tunnels" data={tunnels ?? []}>
          {(t: any) => (
            <tr key={t.id} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3 font-bold text-primary">{t.name}</td>
              <td className="py-3 px-3 font-mono text-outline">{t.id}</td>
              <td className="py-3 px-3"><StatusBadge status={t.status} /></td>
              <td className="py-3 px-3 text-on-surface-variant">{t.connections_count}</td>
            </tr>
          )}
        </Table>
      </Section>

    </div>
  );
}

function NetworkMapSection({ data, onRefresh }: { data: NetworkMap | null; onRefresh: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<NetworkMap | null>(null);

  const displayData = scanResult ?? data;
  const devices = displayData?.devices ?? [];
  const scanInfo = displayData?.scan_info;

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await scanNetworkMap();
      if (res.data.success && res.data.data) {
        setScanResult(res.data.data);
      }
    } catch {
      // scan failed — passive data remains
    } finally {
      setScanning(false);
      onRefresh();
    }
  };

  return (
    <Section
      title="Device Discovery"
      action={
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-1 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50 transition-colors"
        >
          {scanning ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">radar</span>
              Active Scan
            </>
          )}
        </button>
      }
    >
      {scanInfo && (
        <div className="px-4 py-1.5 border-b border-outline-variant bg-surface-container-low flex items-center gap-4 text-data-md text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-primary">info</span>
            {scanInfo.method === 'ping_sweep' ? 'Ping Sweep' : 'Passive (ARP Cache)'}
          </span>
          <span>·</span>
          <span>{scanInfo.hosts_found} devices</span>
          {scanInfo.method === 'ping_sweep' && (
            <>
              <span>·</span>
              <span>{scanInfo.hosts_scanned} scanned</span>
              <span>·</span>
              <span>{(scanInfo.duration_ms / 1000).toFixed(1)}s</span>
            </>
          )}
        </div>
      )}

      {scanning && devices.length === 0 ? (
        <div className="p-8 flex flex-col items-center gap-3 text-on-surface-variant">
          <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-data-md">Scanning network — this may take 5–15 seconds…</span>
        </div>
      ) : (
        <Table
          headers={['Type', 'IP Address', 'MAC Address', 'Vendor', 'Interface', 'Latency']}
          empty="No devices discovered — run an Active Scan"
          data={devices}
        >
          {(device: NetworkDevice, i: number) => (
            <tr key={`${device.ip}-${i}`} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3">
                {device.type === 'router' ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border text-label-xs tracking-wider rounded-sm bg-primary/10 border-primary text-primary">
                    <span className="material-symbols-outlined text-xs">router</span>
                    Router
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border text-label-xs tracking-wider rounded-sm border-outline text-outline">
                    <span className="material-symbols-outlined text-xs">devices</span>
                    Host
                  </span>
                )}
              </td>
              <td className="py-3 px-3 font-mono font-bold text-primary">{device.ip}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{device.mac}</td>
              <td className="py-3 px-3 text-on-surface-variant">{device.vendor === 'Unknown' ? <span className="text-outline">—</span> : device.vendor}</td>
              <td className="py-3 px-3 text-on-surface-variant">{device.interface}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">
                {device.latency_ms != null ? `${device.latency_ms} ms` : <span className="text-outline">—</span>}
              </td>
            </tr>
          )}
        </Table>
      )}
    </Section>
  );
}

function NetTool({ title, url, placeholder, buildBody }: {
  title: string;
  url: string;
  placeholder: string;
  buildBody: (host: string) => Record<string, unknown>;
}) {
  const [host, setHost] = useState('');
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const start = async () => {
    if (!host || running) return;
    setRunning(true);
    setLines([`> ${title.toLowerCase()} ${host}`]);
    try {
      // SSE doesn't support POST natively; fetch with eventstream parser
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(buildBody(host)),
      });
      if (!resp.body) {
        setLines((l) => [...l, '(no stream body)']);
        setRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const ev of events) {
          let event = 'message';
          let data = '';
          for (const ln of ev.split('\n')) {
            if (ln.startsWith('event:')) event = ln.slice(6).trim();
            else if (ln.startsWith('data:')) data += ln.slice(5).trim();
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === 'line' && parsed.line != null) {
              setLines((l) => [...l, parsed.line as string]);
            } else if (event === 'done') {
              setLines((l) => [...l, `(exit ${parsed.return_code ?? 0})`]);
            }
          } catch {
            setLines((l) => [...l, data]);
          }
        }
      }
    } catch (err: any) {
      setLines((l) => [...l, `error: ${err?.message || err}`]);
    }
    setRunning(false);
  };

  return (
    <div className="surface-card border border-outline-variant rounded overflow-hidden">
      <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest flex items-center gap-2">
        <span className="material-symbols-outlined text-on-surface-variant text-sm">network_check</span>
        <span className="text-label-xs text-on-surface-variant tracking-wider">{title}</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface-container-low border border-outline-variant text-on-surface text-data-md py-1.5 px-3 terminal-focus"
            placeholder={placeholder}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={running}
          />
          <button
            onClick={start}
            disabled={!host || running}
            className="px-4 py-1.5 text-data-md bg-primary-container text-on-primary-container hover:bg-primary disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        <pre className="bg-surface-container-low p-3 rounded-sm text-data-md font-mono text-on-surface-variant overflow-auto max-h-64 whitespace-pre">
          {lines.length === 0 ? '(idle)' : lines.join('\n')}
        </pre>
      </div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="surface-card border border-outline-variant rounded overflow-hidden">
      <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest flex items-center justify-between">
        <span className="text-label-xs text-on-surface-variant tracking-wider">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Table({ headers, children, data, empty }: { headers: string[]; children: (item: any, i: number) => React.ReactNode; data: any[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse whitespace-nowrap">
        <thead className="border-b border-outline-variant">
          <tr>
            {headers.map((h, i) => <th key={i} className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">{h}</th>)}
          </tr>
        </thead>
        <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
          {data.length === 0 ? <tr><td colSpan={headers.length} className="py-6 text-center text-on-surface-variant">{empty}</td></tr> : data.map(children)}
        </tbody>
      </table>
    </div>
  );
}
