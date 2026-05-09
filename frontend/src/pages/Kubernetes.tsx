import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getKubernetesNodes, getKubernetesPods, getKubernetesDeployments } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import { useState } from 'react';

export default function Kubernetes() {
  const fetchNodes = useCallback(() => getKubernetesNodes(), []);
  const fetchPods = useCallback(() => getKubernetesPods(), []);
  const fetchDeploys = useCallback(() => getKubernetesDeployments(), []);

  const { data: nodes } = usePolling(fetchNodes, 15000);
  const { data: pods } = usePolling(fetchPods, 10000);
  const { data: deployments } = usePolling(fetchDeploys, 15000);
  const [tab, setTab] = useState<'pods' | 'deployments' | 'nodes'>('pods');

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Kubernetes</h2>
        <p className="text-body-md text-on-surface-variant">K3s cluster nodes, pods, and deployments.</p>
      </div>

      {/* Quick Stats */}
      <div className="flex flex-wrap gap-4">
        <div className="surface-card border border-outline-variant rounded px-4 py-2 flex items-center gap-3">
          <span className="text-label-xs text-on-surface-variant">Nodes</span>
          <span className="text-data-md text-on-surface">{(nodes ?? []).length}</span>
          <div className="w-2 h-2 rounded-full bg-primary neon-glow-active" />
        </div>
        <div className="surface-card border border-outline-variant rounded px-4 py-2 flex items-center gap-3">
          <span className="text-label-xs text-on-surface-variant">Pods</span>
          <span className="text-data-md text-on-surface">{(pods ?? []).length}</span>
        </div>
        <div className="surface-card border border-outline-variant rounded px-4 py-2 flex items-center gap-3">
          <span className="text-label-xs text-on-surface-variant">Deployments</span>
          <span className="text-data-md text-on-surface">{(deployments ?? []).length}</span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0 border-b border-outline-variant">
        {(['pods', 'deployments', 'nodes'] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-data-md border-b-2 transition-colors capitalize ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-outline-variant rounded-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container-highest border-b border-outline-variant sticky top-0 z-10">
              {tab === 'pods' && (
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Namespace</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Status</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Restarts</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Node</th>
                </tr>
              )}
              {tab === 'deployments' && (
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Namespace</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Ready</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Available</th>
                </tr>
              )}
              {tab === 'nodes' && (
                <tr>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Name</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Status</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Roles</th>
                  <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Version</th>
                </tr>
              )}
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30 bg-surface">
              {tab === 'pods' && (pods ?? []).map((p: any, i: number) => (
                <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors group border-l-[3px] border-transparent">
                  <td className="py-3 px-3 font-bold text-primary">{p.name}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.namespace}</td>
                  <td className="py-3 px-3"><StatusBadge status={p.status || 'unknown'} /></td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.restarts ?? 0}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{p.node || '--'}</td>
                </tr>
              ))}
              {tab === 'deployments' && (deployments ?? []).map((d: any, i: number) => (
                <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors group border-l-[3px] border-transparent">
                  <td className="py-3 px-3 font-bold text-primary">{d.name}</td>
                  <td className="py-3 px-3 text-on-surface-variant">{d.namespace}</td>
                  <td className="py-3 px-3 text-on-surface">{d.ready ?? '--'}</td>
                  <td className="py-3 px-3 text-on-surface">{d.available ?? '--'}</td>
                </tr>
              ))}
              {tab === 'nodes' && (nodes ?? []).map((n: any, i: number) => (
                <tr key={i} className="hover:bg-surface-container-highest/50 transition-colors group border-l-[3px] border-transparent">
                  <td className="py-3 px-3 font-bold text-primary">{n.name}</td>
                  <td className="py-3 px-3"><StatusBadge status={n.status || 'unknown'} /></td>
                  <td className="py-3 px-3 text-on-surface-variant">{n.roles || '--'}</td>
                  <td className="py-3 px-3 text-on-surface-variant font-mono">{n.version || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
