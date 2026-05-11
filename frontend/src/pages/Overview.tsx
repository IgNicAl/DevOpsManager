import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import {
  getSystemOverview,
  getSystemHistory,
  getSystemTemperature,
  getTopProcesses,
  getSystemLoad,
  getSystemNetwork,
  getSystemCpu,
  getSystemMemory,
  getSystemDisk,
} from '../services/api';
import StatCard from '../components/ui/StatCard';
import MetricChart from '../components/charts/MetricChart';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

type ExpandedCard = 'cpu' | 'ram' | 'disk' | 'uptime' | null;

export default function Overview() {
  const navigate = useNavigate();
  const fetchOverview = useCallback(() => getSystemOverview(), []);
  const fetchHistory = useCallback(() => getSystemHistory(), []);
  const fetchTemp = useCallback(() => getSystemTemperature(), []);
  const fetchTopCpu = useCallback(() => getTopProcesses('cpu', 5), []);
  const fetchTopMem = useCallback(() => getTopProcesses('memory', 5), []);
  const fetchLoad = useCallback(() => getSystemLoad(), []);
  const fetchNetwork = useCallback(() => getSystemNetwork(), []);
  const fetchCpu = useCallback(() => getSystemCpu(), []);
  const fetchMem = useCallback(() => getSystemMemory(), []);
  const fetchDisk = useCallback(() => getSystemDisk(), []);

  const { data: overview, error: overviewErr } = usePolling(fetchOverview, 5000);
  const { data: history } = usePolling(fetchHistory, 5000);
  const { data: temp } = usePolling(fetchTemp, 15000);
  const { data: topCpu } = usePolling(fetchTopCpu, 5000);
  const { data: topMem } = usePolling(fetchTopMem, 5000);
  const { data: load } = usePolling(fetchLoad, 5000);
  const { data: network } = usePolling(fetchNetwork, 5000);
  const { data: cpuDetails } = usePolling(fetchCpu, 5000);
  const { data: memDetails } = usePolling(fetchMem, 10000);
  const { data: diskPartitions } = usePolling(fetchDisk, 15000);

  const [expanded, setExpanded] = useState<ExpandedCard>(null);
  const toggle = (k: ExpandedCard) => setExpanded((cur) => (cur === k ? null : k));

  if (overviewErr) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="surface-card border border-error rounded p-6 text-center max-w-md">
          <span className="material-symbols-outlined text-error text-4xl mb-4">error</span>
          <h2 className="text-headline-md text-error mb-2">Connection Error</h2>
          <p className="text-body-md text-on-surface-variant">{overviewErr}</p>
        </div>
      </div>
    );
  }

  const ramPercent = overview?.ram_percent ?? 0;
  const diskPercent = overview?.disk_percent ?? 0;
  const cpuPoints = history?.cpu ?? [];
  const ramPoints = history?.ram ?? [];

  const tempEntries: Array<{ chip: string; label: string; current: number }> = [];
  if (temp) {
    for (const [chip, list] of Object.entries(temp)) {
      for (const e of list) tempEntries.push({ chip, label: e.label, current: e.current });
    }
  }
  const cpuTemp = tempEntries.find((e) => /core|tdie|tctl|cpu/i.test(e.label) || /coretemp|k10temp/i.test(e.chip));

  const goToProcess = (name: string) => {
    navigate(`/processes?search=${encodeURIComponent(name)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {load?.high_load && (
        <div className="surface-card border border-tertiary-container rounded p-3 flex items-center gap-3 bg-tertiary-container/10">
          <span className="material-symbols-outlined text-tertiary-container">warning</span>
          <span className="text-data-md text-tertiary-container">
            High CPU load detected (CPU &gt; 80% sustained for 30s+)
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="CPU Usage"
          value={overview?.cpu_percent ?? '--'}
          unit="%"
          icon="memory"
          percent={overview?.cpu_percent}
          color="primary"
          onClick={() => toggle('cpu')}
          expanded={expanded === 'cpu'}
        >
          {cpuDetails && (
            <div className="space-y-1.5">
              <div className="text-label-xs text-on-surface-variant">Per-core ({cpuDetails.core_count} threads, {cpuDetails.physical_cores} cores)</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(cpuDetails.per_core_percent ?? []).map((pct: number, i: number) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-label-xs">
                      <span className="text-on-surface-variant">C{i}</span>
                      <span className={pct > 85 ? 'text-error' : pct > 60 ? 'text-tertiary-container' : 'text-primary'}>{pct}%</span>
                    </div>
                    <div className="progress-track w-full">
                      <div className={`h-full ${pct > 85 ? 'bg-error' : pct > 60 ? 'bg-tertiary-container' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-label-xs text-on-surface-variant pt-2">
                Load avg: {cpuDetails.load_average['1m']} / {cpuDetails.load_average['5m']} / {cpuDetails.load_average['15m']}
                {cpuDetails.frequency_mhz?.current && ` · ${cpuDetails.frequency_mhz.current} MHz`}
              </div>
            </div>
          )}
        </StatCard>

        <StatCard
          label="RAM Used / Total"
          value={overview?.ram_used_gb ?? '--'}
          unit="GB"
          subValue={`/ ${overview?.ram_total_gb ?? '--'}GB`}
          icon="memory_alt"
          percent={ramPercent}
          color={ramPercent > 80 ? 'error' : ramPercent > 60 ? 'tertiary-container' : 'primary'}
          onClick={() => toggle('ram')}
          expanded={expanded === 'ram'}
        >
          {memDetails && (
            <div className="space-y-1 text-data-md">
              <div className="flex justify-between"><span className="text-on-surface-variant">RAM free</span><span>{memDetails.ram.free_gb} GB</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Swap used</span><span>{memDetails.swap.used_gb} / {memDetails.swap.total_gb} GB ({memDetails.swap.percent}%)</span></div>
            </div>
          )}
        </StatCard>

        <StatCard
          label="Disk Usage (/)"
          value={overview?.disk_used_gb != null ? (overview.disk_used_gb / 1024).toFixed(1) : '--'}
          unit="TB"
          subValue={`/ ${overview?.disk_total_gb != null ? (overview.disk_total_gb / 1024).toFixed(1) : '--'}TB`}
          icon="hard_drive"
          percent={diskPercent}
          color={diskPercent > 85 ? 'error' : diskPercent > 70 ? 'tertiary-container' : 'primary'}
          onClick={() => toggle('disk')}
          expanded={expanded === 'disk'}
        >
          <div className="space-y-2">
            {Array.isArray(diskPartitions) && diskPartitions.length > 0 ? (
              <>
                <table className="w-full text-label-xs">
                  <tbody className="divide-y divide-outline-variant/20">
                    {diskPartitions.map((p: any) => {
                      const c = p.percent > 85 ? 'error' : p.percent > 70 ? 'tertiary-container' : 'primary';
                      return (
                        <tr key={`${p.device}-${p.mountpoint}`}>
                          <td className="py-1 text-on-surface font-bold w-[72px]">{p.mountpoint}</td>
                          <td className="py-1 px-2 w-full">
                            <div className="progress-track w-full">
                              <div className={`h-full bg-${c}`} style={{ width: `${Math.min(p.percent, 100)}%` }} />
                            </div>
                          </td>
                          <td className={`py-1 text-right text-${c} tabular-nums whitespace-nowrap`}>{p.percent}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="text-label-xs text-outline pt-0.5">
                  SMART → <button onClick={() => navigate('/storage')} className="text-primary underline">Storage</button>
                </div>
              </>
            ) : (
              <div className="text-data-md text-on-surface-variant">
                For per-partition details and SMART, open the <button onClick={() => navigate('/storage')} className="text-primary underline">Storage</button> tab.
              </div>
            )}
          </div>
        </StatCard>

        <StatCard
          label="System Uptime"
          value={overview?.uptime_seconds ? formatUptime(overview.uptime_seconds) : '--'}
          icon="schedule"
          color="on-surface"
          onClick={() => toggle('uptime')}
          expanded={expanded === 'uptime'}
        >
          <div className="text-data-md text-on-surface-variant space-y-1">
            <div>Hostname: <span className="text-primary font-bold">{overview?.hostname}</span></div>
            <div>OS: {overview?.os_name}</div>
            <div className="font-mono text-label-xs break-all">{overview?.kernel_version}</div>
          </div>
        </StatCard>
      </div>

      {/* History charts + Temperature */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <MetricChart points={cpuPoints} unit="%" label="CPU last 60s" />
        <MetricChart points={ramPoints} unit="%" label="RAM last 60s" color="var(--color-secondary)" />
        <div className="surface-card border border-outline-variant rounded p-3 flex flex-col">
          <div className="text-label-xs text-on-surface-variant mb-2">Temperature</div>
          {cpuTemp ? (
            <div className="flex items-baseline gap-2">
              <span className={`data-display ${cpuTemp.current > 80 ? 'text-error' : cpuTemp.current > 65 ? 'text-tertiary-container' : 'text-primary'}`} style={{ fontSize: 36 }}>
                {cpuTemp.current.toFixed(1)}
              </span>
              <span className="text-body-md text-on-surface-variant">°C</span>
              <span className="ml-3 text-label-xs text-on-surface-variant">{cpuTemp.label} ({cpuTemp.chip})</span>
            </div>
          ) : (
            <div className="text-body-md text-on-surface-variant flex-1 flex items-center">
              <span>Sensors not available</span>
            </div>
          )}
          {tempEntries.length > 1 && (
            <div className="mt-3 grid grid-cols-2 gap-1 text-label-xs text-on-surface-variant">
              {tempEntries.slice(0, 6).map((e, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{e.label}</span>
                  <span>{e.current.toFixed(1)}°</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top processes — clickable to filter Processes page */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopProcessesCard title="Top 5 by CPU" rows={topCpu ?? []} metric="cpu_percent" onRowClick={goToProcess} />
        <TopProcessesCard title="Top 5 by Memory" rows={topMem ?? []} metric="memory_percent" onRowClick={goToProcess} />
      </div>

      {/* Network I/O strip */}
      {Array.isArray(network) && network.length > 0 && (
        <div className="surface-card border border-outline-variant rounded p-3 flex flex-wrap gap-6 items-center">
          <span className="text-label-xs text-on-surface-variant">Network I/O</span>
          {network.slice(0, 3).map((iface: any) => (
            <div key={iface.interface} className="flex items-center gap-2 text-data-md">
              <span className="text-on-surface-variant">{iface.interface}</span>
              <span className="text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">arrow_downward</span>
                {(iface.bytes_recv / (1024 ** 3)).toFixed(2)} GB
              </span>
              <span className="text-tertiary-container flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">arrow_upward</span>
                {(iface.bytes_sent / (1024 ** 3)).toFixed(2)} GB
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Server Info */}
      <div className="mt-auto surface-card border border-outline-variant rounded p-3 flex flex-wrap justify-between items-center text-on-surface-variant text-data-md gap-4">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-sm">dns</span>
          <span className="text-primary font-bold">{overview?.hostname ?? '--'}</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <span>{overview?.os_name ?? '--'}</span>
          <span>{overview?.kernel_version ? `Kernel ${overview.kernel_version.substring(0, 30)}` : '--'}</span>
        </div>
      </div>
    </div>
  );
}

function TopProcessesCard({ title, rows, metric, onRowClick }: {
  title: string;
  rows: any[];
  metric: 'cpu_percent' | 'memory_percent';
  onRowClick: (name: string) => void;
}) {
  return (
    <div className="surface-card border border-outline-variant rounded p-3">
      <div className="text-label-xs text-on-surface-variant mb-3">{title}</div>
      <table className="w-full text-data-md">
        <tbody className="divide-y divide-outline-variant/30">
          {rows.length === 0 && (
            <tr><td colSpan={3} className="py-4 text-on-surface-variant text-center">No data</td></tr>
          )}
          {rows.map((p: any) => (
            <tr
              key={p.pid}
              onClick={() => p.name && onRowClick(p.name)}
              className="cursor-pointer hover:bg-surface-container-highest/40 transition-colors"
              title="Click to filter Processes by name"
            >
              <td className="py-1.5 font-mono text-outline w-16">{p.pid}</td>
              <td className="py-1.5 text-on-surface truncate max-w-[260px]">{p.name}</td>
              <td className="py-1.5 text-right text-primary">{Number(p[metric] ?? 0).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
