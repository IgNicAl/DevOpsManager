import { useEffect, useRef } from 'react';
import { openSSE, type SseHandlers } from '../services/sse';

export function useSSE(path: string | null, handlers: SseHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!path) return;
    const es = openSSE(path, {
      events: handlersRef.current.events,
      onMessage: (event, data) => handlersRef.current.onMessage?.(event, data),
      onError: (err) => handlersRef.current.onError?.(err),
      onOpen: () => handlersRef.current.onOpen?.(),
    });
    return () => es.close();
  }, [path]);
}
