import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getTraefikRoutes, getCertificates, getTailscalePeers, getCloudflareTunnels } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';

export default function Network() {
  const fetchPeers = useCallback(() => getTailscalePeers(), []);
  const fetchCerts = useCallback(() => getCertificates(), []);
  const fetchRoutes = useCallback(() => getTraefikRoutes(), []);
  const fetchTunnels = useCallback(() => getCloudflareTunnels(), []);

  const { data: peers } = usePolling(fetchPeers, 15000);
  const { data: certs } = usePolling(fetchCerts, 60000);
  const { data: routes } = usePolling(fetchRoutes, 30000);
  const { data: tunnels } = usePolling(fetchTunnels, 30000);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <h2 className="text-headline-lg text-on-surface mb-1">Network</h2>
      <p className="text-body-md text-on-surface-variant">Traefik, TLS certs, Tailscale, Cloudflare.</p>

      <div className="flex flex-wrap gap-4">
        {[
          { label: 'Routes', count: (routes ?? []).length },
          { label: 'Certs', count: (certs ?? []).length },
          { label: 'Peers', count: (peers ?? []).length },
          { label: 'Tunnels', count: (tunnels ?? []).length },
        ].map((s) => (
          <div key={s.label} className="surface-card border border-outline-variant rounded px-4 py-2 flex items-center gap-3">
            <span className="text-label-xs text-on-surface-variant">{s.label}</span>
            <span className="text-data-md text-on-surface">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Tailscale */}
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

      {/* Certs */}
      <Section title="TLS Certificates">
        <Table headers={['Domain', 'Issuer', 'Expiry']} empty="No certs" data={certs ?? []}>
          {(cert: any, i: number) => (
            <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors">
              <td className="py-3 px-3 font-bold text-primary">{cert.domain || '--'}</td>
              <td className="py-3 px-3 text-on-surface-variant">{cert.issuer || '--'}</td>
              <td className="py-3 px-3 font-mono text-on-surface-variant">{cert.not_after || '--'}</td>
            </tr>
          )}
        </Table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card border border-outline-variant rounded overflow-hidden">
      <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
        <span className="text-label-xs text-on-surface-variant tracking-wider">{title}</span>
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
            {headers.map((h) => <th key={h} className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">{h}</th>)}
          </tr>
        </thead>
        <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
          {data.length === 0 ? <tr><td colSpan={headers.length} className="py-6 text-center text-on-surface-variant">{empty}</td></tr> : data.map(children)}
        </tbody>
      </table>
    </div>
  );
}
