import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getSystemUsers, getLastLogins, getUserSessions } from '../services/api';

export default function Users() {
  const fetchUsers = useCallback(() => getSystemUsers(), []);
  const fetchLast = useCallback(() => getLastLogins(20), []);
  const fetchSess = useCallback(() => getUserSessions(), []);
  const { data: users, error: usersErr } = usePolling(fetchUsers, 60000);
  const { data: last } = usePolling(fetchLast, 60000);
  const { data: sessions } = usePolling(fetchSess, 30000);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div>
        <h2 className="text-headline-lg text-on-surface mb-1">Users &amp; Sessions</h2>
        <p className="text-body-md text-on-surface-variant">System users (UID ≥ 1000), last logins, active sessions.</p>
      </div>

      <div className="surface-card border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
          <span className="text-label-xs text-on-surface-variant tracking-wider">System Users ({(users ?? []).length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Username</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">UID</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Home</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Shell</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Groups</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {usersErr && (
                <tr><td colSpan={5} className="py-6 text-center text-error">{usersErr}</td></tr>
              )}
              {!usersErr && (users ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No users</td></tr>
              )}
              {(users ?? []).map((u: any) => (
                <tr key={u.uid} className="hover:bg-surface-container-highest/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-primary">{u.username}</td>
                  <td className="py-3 px-3 font-mono text-on-surface-variant">{u.uid}</td>
                  <td className="py-3 px-3 font-mono text-on-surface-variant">{u.home}</td>
                  <td className="py-3 px-3 font-mono text-on-surface-variant">{u.shell}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {u.groups.map((g: string) => (
                        <span key={g} className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant text-label-xs text-on-surface-variant rounded-sm">{g}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="surface-card border border-outline-variant rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
            <span className="text-label-xs text-on-surface-variant tracking-wider">Active Sessions</span>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">User</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">TTY</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Login</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Host</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(sessions ?? []).length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-on-surface-variant">No active sessions</td></tr>
              )}
              {(sessions ?? []).map((s: any, i: number) => (
                <tr key={i}>
                  <td className="py-2 px-3 font-bold text-primary">{s.username}</td>
                  <td className="py-2 px-3 font-mono text-on-surface-variant">{s.tty}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{s.login_at}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{s.host || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="surface-card border border-outline-variant rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-highest">
            <span className="text-label-xs text-on-surface-variant tracking-wider">Last 20 logins</span>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="border-b border-outline-variant">
              <tr>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">User</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">TTY</th>
                <th className="py-2 px-3 text-label-xs text-on-surface-variant tracking-wider">Host</th>
              </tr>
            </thead>
            <tbody className="text-data-md text-on-surface divide-y divide-outline-variant/30">
              {(last ?? []).length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-on-surface-variant">No login history</td></tr>
              )}
              {(last ?? []).map((l: any, i: number) => (
                <tr key={i}>
                  <td className="py-2 px-3 font-bold text-primary">{l.username}</td>
                  <td className="py-2 px-3 font-mono text-on-surface-variant">{l.tty}</td>
                  <td className="py-2 px-3 text-on-surface-variant">{l.host || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
