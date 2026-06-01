import { useEffect, useState, useCallback, useRef } from 'react';
import { SmpClient } from '../../lib/smp-client';
import { ErrorBanner } from '../ui/ErrorBanner';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { OverviewTab } from './OverviewTab';
import { PlayersTab } from './PlayersTab';
import { ChatTab } from './ChatTab';
import { AllowlistTab } from './AllowlistTab';
import { BanTab } from './BanTab';
import { IpBanTab } from './IpBanTab';
import { OperatorsTab } from './OperatorsTab';
import { SettingsTab } from './SettingsTab';
import { GamerulesTab } from './GamerulesTab';
import { MoreTab } from './MoreTab';

interface SmpPanelProps {
  instanceId: string;
  managementPort: number;
  managementToken: string;
}

interface TabDef {
  key: string;
  label: string;
  labelJa: string;
}

const TABS: TabDef[] = [
  { key: 'overview',   label: 'Overview',     labelJa: '概要' },
  { key: 'players',    label: 'Players',      labelJa: 'プレイヤー' },
  { key: 'chat',       label: 'Chat',          labelJa: 'チャット' },
  { key: 'allowlist',  label: 'Allowlist',     labelJa: 'ホワイトリスト' },
  { key: 'bans',       label: 'Bans',          labelJa: 'BAN' },
  { key: 'ipbans',     label: 'IP Bans',       labelJa: 'IP BAN' },
  { key: 'operators',  label: 'Operators',     labelJa: 'OP' },
  { key: 'settings',   label: 'Settings',      labelJa: '設定' },
  { key: 'gamerules',  label: 'Gamerules',     labelJa: 'ゲームルール' },
  { key: 'more',       label: 'More',          labelJa: 'その他' },
];

export default function SmpPanel({ managementPort, managementToken }: SmpPanelProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [client, setClient] = useState<SmpClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<SmpClient | null>(null);

  const connect = useCallback(async () => {
    if (!managementPort || !managementToken) {
      setError('SMP management port or token not configured.');
      setConnecting(false);
      return;
    }

    setConnecting(true);
    setError(null);

    const url = `ws://localhost:${managementPort}/`;
    const c = new SmpClient(url, managementToken);
    clientRef.current = c;
    setClient(c);

    try {
      await c.connect();
      setConnected(true);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to SMP management server.');
    } finally {
      setConnecting(false);
    }
  }, [managementPort, managementToken]);

  useEffect(() => {
    connect();
    return () => {
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [connect]);

  const handleRetry = () => {
    clientRef.current?.close();
    connect();
  };

  if (connecting) {
    return (
      <div className="rounded-xl bg-app-surface border border-app-border">
        <LoadingSkeleton lines={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-app-surface border border-app-border p-6">
        <ErrorBanner message={error} onRetry={handleRetry} />
        {!connected && managementPort > 0 && (
          <p className="mt-4 text-xs text-app-text-muted text-center">
            SMP server at ws://localhost:{managementPort}/
          </p>
        )}
      </div>
    );
  }

  if (!connected || !client) {
    return (
      <div className="rounded-xl bg-app-surface border border-app-border p-6">
        <ErrorBanner message="Not connected to SMP management server." onRetry={handleRetry} />
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':   return <OverviewTab client={client} />;
      case 'players':    return <PlayersTab client={client} />;
      case 'chat':       return <ChatTab client={client} />;
      case 'allowlist':  return <AllowlistTab client={client} />;
      case 'bans':       return <BanTab client={client} />;
      case 'ipbans':     return <IpBanTab client={client} />;
      case 'operators':  return <OperatorsTab client={client} />;
      case 'settings':   return <SettingsTab client={client} />;
      case 'gamerules':  return <GamerulesTab client={client} />;
      case 'more':       return <MoreTab client={client} />;
      default:           return <OverviewTab client={client} />;
    }
  };

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Tab Bar */}
      <div className="flex-shrink-0 border-b border-app-border overflow-x-auto">
        <div className="flex gap-0.5 px-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-app-accent text-app-accent'
                  : 'border-transparent text-app-text-muted hover:text-app-text-secondary hover:border-app-border-hover'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.labelJa}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderTab()}
      </div>
    </div>
  );
}
