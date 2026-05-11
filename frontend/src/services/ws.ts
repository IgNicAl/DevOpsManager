const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function toWsBase(http: string): string {
  if (http.startsWith('https://')) return 'wss://' + http.slice(8);
  if (http.startsWith('http://')) return 'ws://' + http.slice(7);
  return http;
}

export function openWebSocket(path: string, params?: Record<string, string>): WebSocket {
  const base = toWsBase(API_BASE);
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${base}${path}${qs}`;
  return new WebSocket(url);
}
