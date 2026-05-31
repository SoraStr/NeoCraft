import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { IpcEvent } from '../lib/types';
import { useInstanceStore } from '../stores/instanceStore';

type EventHandler = (event: IpcEvent) => void;

interface WsContextValue {
  wsConnected: boolean;
  daemonConnected: boolean;
  onEvent: (handler: EventHandler) => () => void;
}

const WsContext = createContext<WsContextValue>({
  wsConnected: false,
  daemonConnected: false,
  onEvent: () => () => {},
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [wsConnected, setWsConnected] = useState(false);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<EventHandler>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
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
      } catch { /* ignore parse errors */ }
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  const onEvent = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  // H9: Global event handlers that persist across navigation
  useEffect(() => {
    return onEvent((event) => {
      const store = useInstanceStore.getState();
      if (event.event === 'instance.state_change') {
        store.updateInstanceState(
          event.data.instance_id as string,
          event.data.state as 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'
        );
      } else if (event.event === 'instance.stats') {
        store.updateStats(event.data.instance_id as string, {
          instanceId: event.data.instance_id as string,
          cpuPercent: event.data.cpu_percent as number,
          memoryMb: event.data.memory_mb as number,
          uptimeSecs: event.data.uptime_secs as number,
        });
      } else if (event.event === 'instance.log') {
        store.appendLog(event.data.instance_id as string, {
          instanceId: event.data.instance_id as string,
          line: event.data.line as string,
          timestamp: event.data.timestamp as number,
        });
      }
    });
  }, [onEvent]);

  return (
    <WsContext.Provider value={{ wsConnected, daemonConnected, onEvent }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WsContext);
}
