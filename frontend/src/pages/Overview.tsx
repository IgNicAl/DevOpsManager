import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getSystemOverview, getSystemCpu, getSystemNetwork, getSystemDisk } from '../services/api';
import StatCard from '../components/ui/StatCard';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

export default function Overview() {
  const fetchOverview = useCallback(() => getSystemOverview(), []);
  const fetchCpu = useCallback(() => getSystemCpu(), []);
  const fetchNetwork = useCallback(() => getSystemNetwork(), []);
  const fetchDisk = useCallback(() => getSystemDisk(), []);

  const { data: overview, error: overviewErr } = usePolling(fetchOverview, 5000);
  const { data: cpu } = usePolling(fetchCpu, 5000);
  const { data: network } = usePolling(fetchNetwork, 5000);
  const { data: disks } = usePolling(fetchDisk, 30000);

  const [selectedDiskIdx, setSelectedDiskIdx] = useState(0);

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

  const currentDisk = (disks ?? [])[selectedDiskIdx] ?? null;
  const diskPercent = currentDisk?.percent ?? 0;
  const diskColor = diskPercent > 85 ? 'error' : diskPercent > 70 ? 'tertiary-container' : 'primary';

  return (
    <div className="flex flex-col gap-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="CPU Usage"
          value={overview?.cpu_percent ?? '--'}
          unit="%"
          icon="memory"
          percent={overview?.cpu_percent}
          color="primary"
        />
        <StatCard
          label="RAM Used / Total"
          value={overview?.ram_used_gb ?? '--'}
          unit="GB"
          subValue={`/ ${overview?.ram_total_gb ?? '--'}GB`}
          icon="memory_alt"
          percent={ramPercent}
          color={ramPercent > 80 ? 'error' : ramPercent > 60 ? 'tertiary-container' : 'primary'}
        />
        <div className="surface-card border border-outline-variant rounded flex flex-col relative overflow-hidden">
          <div className="p-3 pb-6 flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="flex flex-col gap-1">
                <span className="text-label-xs text-on-surface-variant">Disk Usage</span>
                {disks && disks.length > 1 && (
                  <select
                    value={selectedDiskIdx}
                    onChange={(e) => setSelectedDiskIdx(Number(e.target.value))}
                    className="text-label-xs text-on-surface bg-surface border border-outline-variant rounded px-1 py-0.5 cursor-pointer"
                  >
                    {disks.map((d: any, i: number) => (
                      <option key={d.mountpoint} value={i}>{d.mountpoint}</option>
                    ))}
                  </select>
                )}
                {(!disks || disks.length <= 1) && (
                  <span className="text-label-xs text-on-surface-variant">{currentDisk?.mountpoint ?? '/'}</span>
                )}
              </div>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">hard_drive</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className={`data-display text-${diskColor}`}>
                {currentDisk?.used_gb?.toFixed(1) ?? '--'}
                <span className="text-2xl text-on-surface-variant">GB</span>
              </div>
              <div className="text-data-md text-on-surface-variant">/ {currentDisk?.total_gb?.toFixed(1) ?? '--'}GB</div>
            </div>
          </div>
          <div className="progress-track w-full absolute bottom-0 left-0">
            <div className={`h-full bg-${diskColor} transition-all duration-500`} style={{ width: `${Math.min(diskPercent, 100)}%` }} />
          </div>
        </div>
        <div className="surface-card border border-outline-variant rounded flex flex-col relative overflow-hidden">
          <div className="p-3 pb-6 flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="text-label-xs text-on-surface-variant">System Uptime</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">schedule</span>
            </div>
            <div className="text-data-lg text-on-surface" style={{ fontSize: '28px', lineHeight: 1 }}>
              {overview?.uptime_seconds ? formatUptime(overview.uptime_seconds) : '--'}
            </div>
          </div>
          <div className="progress-track w-full absolute bottom-0 left-0">
            <div className="h-full bg-surface-variant" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      {/* Per-Core + Network I/O */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Per-Core Utilization */}
        <div className="xl:col-span-2 surface-card border border-outline-variant rounded p-4 flex flex-col">
          <div className="flex justify-between items-center mb-6 border-b border-outline-variant pb-2">
            <h2 className="text-label-xs text-on-surface-variant tracking-wider">
              Per-Core Utilization ({cpu?.core_count ?? '--'} Cores)
            </h2>
          </div>
          <div className="flex-1 grid grid-cols-4 gap-4">
            {(cpu?.per_core_percent ?? []).map((pct: number, i: number) => {
              const color = pct > 85 ? 'error' : pct > 60 ? 'tertiary-container' : 'primary';
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-label-xs">
                    <span className="text-on-surface-variant">C{String(i).padStart(2, '0')}</span>
                    <span className={`text-${color}`}>{pct}%</span>
                  </div>
                  <div className="progress-track w-full">
                    <div className={`h-full bg-${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Network I/O */}
        <div className="surface-card border border-outline-variant rounded p-4 flex flex-col">
          <div className="flex justify-between items-center mb-6 border-b border-outline-variant pb-2">
            <h2 className="text-label-xs text-on-surface-variant tracking-wider">Network I/O</h2>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-6">
            {(network ?? []).slice(0, 2).map((iface: any) => (
              <div key={iface.interface} className="space-y-2">
                <span className="text-label-xs text-on-surface-variant">{iface.interface}</span>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                    <span className="text-label-xs">RX</span>
                  </div>
                  <span className="text-data-lg text-on-surface">
                    {(iface.bytes_recv / (1024 ** 3)).toFixed(1)} <span className="text-on-surface-variant text-sm">GB</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-tertiary-container">
                    <span className="material-symbols-outlined text-sm">arrow_upward</span>
                    <span className="text-label-xs">TX</span>
                  </div>
                  <span className="text-data-lg text-on-surface">
                    {(iface.bytes_sent / (1024 ** 3)).toFixed(1)} <span className="text-on-surface-variant text-sm">GB</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
