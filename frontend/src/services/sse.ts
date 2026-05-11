const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface SseHandlers {
  onMessage?: (event: string, data: unknown) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  events?: string[];
}

export function openSSE(path: string, handlers: SseHandlers): EventSource {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const es = new EventSource(url);

  if (handlers.onOpen) es.addEventListener('open', () => handlers.onOpen!());

  const dispatch = (eventName: string) => (e: MessageEvent) => {
    let parsed: unknown = e.data;
    try {
      parsed = JSON.parse(e.data);
    } catch {
      // keep raw string
    }
    handlers.onMessage?.(eventName, parsed);
  };

  const events = handlers.events && handlers.events.length > 0 ? handlers.events : ['message'];
  for (const name of events) {
    es.addEventListener(name, dispatch(name));
  }

  if (handlers.onError) es.addEventListener('error', (e) => handlers.onError!(e));

  return es;
}
