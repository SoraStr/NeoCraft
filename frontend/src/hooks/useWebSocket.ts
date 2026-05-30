import { useEffect, useRef, useState, useCallback } from 'react';
import type { IpcEvent } from '../lib/types';

type EventHandler = (event: IpcEvent) => void;

export function useWebSocket() {
  const [wsConnected, setWsConnected] = useState(false);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<EventHandler>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    // Clean up old socket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onclose = () => {
      setWsConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as IpcEvent;
        if (msg.event === 'daemon.status') {
          setDaemonConnected(!!(msg.data as any).connected);
        }
        handlersRef.current.forEach((handler) => handler(msg));
      } catch {
        // ignore parse errors
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const onEvent = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { wsConnected, daemonConnected, onEvent };
}
