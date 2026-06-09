import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SmpClient } from '../lib/smp-client';

interface UseSmpConnectionOptions {
  managementPort: number;
  managementToken: string;
  managementTlsEnabled: boolean;
}

export function useSmpConnection({
  managementPort,
  managementToken,
  managementTlsEnabled,
}: UseSmpConnectionOptions) {
  const { t } = useTranslation();
  const [client, setClient] = useState<SmpClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<SmpClient | null>(null);

  const url = useMemo(() => {
    const protocol = managementTlsEnabled ? 'wss' : 'ws';
    return `${protocol}://localhost:${managementPort}/`;
  }, [managementPort, managementTlsEnabled]);

  const close = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    setClient(null);
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    close();

    if (!managementPort || !managementToken) {
      setError(t('management.status.smpNotConfigured'));
      setConnecting(false);
      return;
    }

    setConnecting(true);
    setError(null);

    const nextClient = new SmpClient(url, managementToken);
    clientRef.current = nextClient;
    setClient(nextClient);

    try {
      await nextClient.connect();
      setConnected(true);
    } catch (err) {
      setClient(null);
      setConnected(false);
      setError(err instanceof Error ? err.message : t('management.status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  }, [close, managementPort, managementToken, t, url]);

  useEffect(() => {
    void connect();
    return close;
  }, [connect, close]);

  return {
    client,
    connected,
    connecting,
    error,
    retry: connect,
    url,
  };
}
