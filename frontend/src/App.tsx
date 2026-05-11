import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/ui/Sidebar';
import { ToastProvider } from './components/ui/Toast';
import Overview from './pages/Overview';
import Storage from './pages/Storage';
import Services from './pages/Services';
import Kubernetes from './pages/Kubernetes';
import GitOps from './pages/GitOps';
import Docker from './pages/Docker';
import Processes from './pages/Processes';
import Backups from './pages/Backups';
import Network from './pages/Network';
import Logs from './pages/Logs';
import Dns from './pages/Dns';
import Users from './pages/Users';
import Cron from './pages/Cron';
import Alerts from './pages/Alerts';
import Terminal from './pages/Terminal';

function AppLayout() {
  const location = useLocation();

  const PAGE_TITLES: Record<string, string> = {
    '/': 'Overview',
    '/storage': 'Storage',
    '/services': 'Services',
    '/kubernetes': 'Kubernetes',
    '/gitops': 'GitOps',
    '/docker': 'Docker',
    '/processes': 'Processes',
    '/backups': 'Backups',
    '/network': 'Network',
    '/logs': 'Logs',
    '/dns': 'Domains & DNS',
    '/users': 'Users',
    '/cron': 'Cron',
    '/alerts': 'Alerts',
    '/terminal': 'Terminal',
  };

  const pageTitle = PAGE_TITLES[location.pathname] || 'DevOps Manager';

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 md:ml-[240px] flex flex-col min-h-screen">
        {/* TopAppBar */}
        <header className="flex justify-between items-center w-full px-6 h-16 bg-surface border-b border-outline-variant sticky top-0 z-50">
          <span className="text-headline-md font-bold text-on-surface uppercase tracking-wider">{pageTitle}</span>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-surface-container-low border border-outline-variant/50 rounded text-data-md text-on-surface-variant">
              <div className="w-2 h-2 rounded-full bg-primary neon-glow-active" />
              <span className="font-mono">localhost</span>
            </div>
            <div className="flex items-center gap-2 border-l border-outline-variant/50 pl-4">
              <button className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-highest rounded transition-colors">
                <span className="material-symbols-outlined text-[20px]">monitoring</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-highest rounded transition-colors relative">
                <span className="material-symbols-outlined text-[20px]">notifications</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-highest rounded transition-colors">
                <span className="material-symbols-outlined text-[20px]">settings</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/storage" element={<Storage />} />
            <Route path="/services" element={<Services />} />
            <Route path="/kubernetes" element={<Kubernetes />} />
            <Route path="/gitops" element={<GitOps />} />
            <Route path="/docker" element={<Docker />} />
            <Route path="/processes" element={<Processes />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/network" element={<Network />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/dns" element={<Dns />} />
            <Route path="/users" element={<Users />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/terminal" element={<Terminal />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ToastProvider>
  );
}
