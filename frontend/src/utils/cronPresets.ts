export interface CronPreset {
  label: string;
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
  description: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', minute: '*', hour: '*', dom: '*', month: '*', dow: '*', description: 'Executes once every minute' },
  { label: 'Every 5 minutes', minute: '*/5', hour: '*', dom: '*', month: '*', dow: '*', description: 'Executes every 5 minutes' },
  { label: 'Every 15 minutes', minute: '*/15', hour: '*', dom: '*', month: '*', dow: '*', description: 'Executes every 15 minutes' },
  { label: 'Every hour', minute: '0', hour: '*', dom: '*', month: '*', dow: '*', description: 'Executes at the top of every hour' },
  { label: 'Every day at 03:00', minute: '0', hour: '3', dom: '*', month: '*', dow: '*', description: 'Executes every day at 03:00' },
  { label: 'Every day at midnight', minute: '0', hour: '0', dom: '*', month: '*', dow: '*', description: 'Executes every day at 00:00' },
  { label: 'Every Monday at 09:00', minute: '0', hour: '9', dom: '*', month: '*', dow: '1', description: 'Executes every Monday at 09:00' },
  { label: 'First day of month at 02:00', minute: '0', hour: '2', dom: '1', month: '*', dow: '*', description: 'Executes on day 1 of every month at 02:00' },
];

const FIELD_LABELS: Record<string, string> = {
  minute: 'minute',
  hour: 'hour',
  dom: 'day of month',
  month: 'month',
  dow: 'day of week',
};

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function describeCron(minute: string, hour: string, dom: string, month: string, dow: string): string {
  const allStar = [minute, hour, dom, month, dow].every((f) => f === '*');
  if (allStar) return 'Executes every minute';

  // Specific time
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
    return `Executes every day at ${pad2(hour)}:${pad2(minute)}`;
  }

  // Every N minutes
  if (/^\*\/(\d+)$/.test(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Executes every ${minute.slice(2)} minutes`;
  }

  // Top of every hour
  if (minute === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Executes at the top of every hour';
  }

  // Specific weekday at specific time
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d+$/.test(dow)) {
    const day = DOW_NAMES[Number(dow) % 7];
    return `Executes every ${day} at ${pad2(hour)}:${pad2(minute)}`;
  }

  // Day of month
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && month === '*' && dow === '*') {
    return `Executes on day ${dom} of every month at ${pad2(hour)}:${pad2(minute)}`;
  }

  return `Custom schedule (${minute} ${hour} ${dom} ${month} ${dow})`;
}

function pad2(s: string): string {
  return s.padStart(2, '0');
}

export function fieldLabel(key: keyof typeof FIELD_LABELS): string {
  return FIELD_LABELS[key];
}
