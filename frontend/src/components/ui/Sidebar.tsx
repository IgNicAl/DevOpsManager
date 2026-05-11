import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getHealth } from '../../services/api';
import { useActiveAlerts } from '../../hooks/useActiveAlerts';
import AlertBadge from './AlertBadge';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', icon: 'dashboard' },
  { path: '/processes', label: 'Processes', icon: 'memory' },
  { path: '/services', label: 'Services', icon: 'settings_input_component' },
  { path: '/docker', label: 'Docker', icon: 'deployed_code' },
  { path: '/kubernetes', label: 'Kubernetes', icon: 'hub' },
  { path: '/gitops', label: 'GitOps', icon: 'sync' },
  { path: '/storage', label: 'Storage', icon: 'storage' },
  { path: '/network', label: 'Network', icon: 'lan' },
  { path: '/dns', label: 'Domains/DNS', icon: 'dns' },
  { path: '/users', label: 'Users', icon: 'group' },
  { path: '/cron', label: 'Cron', icon: 'schedule' },
  { path: '/terminal', label: 'Terminal', icon: 'terminal' },
  { path: '/logs', label: 'Logs', icon: 'description' },
  { path: '/backups', label: 'Backups', icon: 'backup' },
  { path: '/alerts', label: 'Alerts', icon: 'notifications' },
];

export default function Sidebar() {
  const [isHealthy, setIsHealthy] = useState(false);
  const alertCount = useActiveAlerts(10000);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await getHealth();
        setIsHealthy(res.data.success);
      } catch {
        setIsHealthy(false);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="fixed left-0 top-0 h-screen w-[240px] bg-surface-container border-r border-outline-variant flex-col py-4 z-40 hidden md:flex">
      {/* Brand */}
      <div className="px-6 pb-6 border-b border-outline-variant/50 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-surface flex items-center justify-center border border-outline-variant">
            <span className="material-symbols-outlined text-primary text-xl">terminal</span>
          </div>
          <div>
            <h1 className="text-headline-md font-black text-primary uppercase tracking-wider" style={{ fontSize: '14px' }}>
              Core Engine
            </h1>
            <span className="text-label-xs text-on-surface-variant">v2.4.1-stable</span>
          </div>
        </div>
        {/* Health indicator */}
        <div className="flex items-center gap-2 mt-3 pl-11">
          <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-primary pulse-active' : 'bg-error pulse-error'}`} />
          <span className="text-label-xs text-on-surface-variant">
            {isHealthy ? 'API Online' : 'API Offline'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `border-l-2 flex items-center py-3 px-4 transition-all group gap-3 text-data-md ${
                isActive
                  ? 'border-primary-container bg-surface-container-high text-primary'
                  : 'border-transparent text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.path === '/alerts' && <AlertBadge count={alertCount} />}
          </NavLink>
        ))}
      </div>

      {/* Footer */}
      <div className="px-2 mt-auto border-t border-outline-variant/50 pt-4 space-y-1">
        <a href="#" className="border-l-2 border-transparent text-on-surface-variant flex items-center py-2 px-4 hover:bg-surface-container-highest hover:text-on-surface transition-all gap-3 text-data-md">
          <span className="material-symbols-outlined text-[18px]">help</span>
          Documentation
        </a>
      </div>
    </nav>
  );
}
