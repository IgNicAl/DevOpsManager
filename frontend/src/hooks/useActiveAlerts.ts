import { useEffect, useState } from 'react';
import { getActiveAlerts } from '../services/api';

export function useActiveAlerts(intervalMs = 10000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await getActiveAlerts();
        if (!cancelled && res.data.success && Array.isArray(res.data.data)) {
          setCount(res.data.data.length);
        }
      } catch {
        // ignore
      }
    };
    fetchOnce();
    const handle = setInterval(fetchOnce, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [intervalMs]);

  return count;
}
