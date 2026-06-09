import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSmpActivity } from '../../hooks/useSmpActivity';
import { useSmpConnection } from '../../hooks/useSmpConnection';
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
  managementTlsEnabled: boolean;
}

const TAB_KEYS = ['overview','players','chat','allowlist','bans','ipBans','operators','settings','gamerules','more'];

function ConnectedSmpPanel({ client }: { client: NonNullable<ReturnType<typeof useSmpConnection>['client']> }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');
  const activity = useSmpActivity(client);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':   return <OverviewTab {...activity} onRetry={activity.retry} />;
      case 'players':    return <PlayersTab client={client} />;
      case 'chat':       return <ChatTab client={client} players={activity.status?.players ?? []} />;
      case 'allowlist':  return <AllowlistTab client={client} />;
      case 'bans':       return <BanTab client={client} />;
      case 'ipBans':     return <IpBanTab client={client} />;
      case 'operators':  return <OperatorsTab client={client} />;
      case 'settings':   return <SettingsTab client={client} />;
      case 'gamerules':  return <GamerulesTab client={client} />;
      case 'more':       return <MoreTab client={client} />;
      default:           return <OverviewTab {...activity} onRetry={activity.retry} />;
    }
  };

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Tab Bar */}
      <div className="flex-shrink-0 border-b border-app-border overflow-x-auto">
        <div className="flex gap-0.5 px-1">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-app-accent text-app-accent'
                  : 'border-transparent text-app-text-muted hover:text-app-text-secondary hover:border-app-border-hover'
              }`}
            >
              {t(`management.tabs.${key}`)}
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

export default function SmpPanel({ managementPort, managementToken, managementTlsEnabled }: SmpPanelProps) {
  const { t } = useTranslation();
  const { client, connected, connecting, error, retry, url } = useSmpConnection({
    managementPort,
    managementToken,
    managementTlsEnabled,
  });

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
        <ErrorBanner message={error} onRetry={retry} />
        {!connected && managementPort > 0 && (
          <p className="mt-4 text-xs text-app-text-muted text-center">
            SMP server at {url}
          </p>
        )}
      </div>
    );
  }

  if (!connected || !client) {
    return (
      <div className="rounded-xl bg-app-surface border border-app-border p-6">
        <ErrorBanner message={t('management.status.notConnected')} onRetry={retry} />
      </div>
    );
  }

  return <ConnectedSmpPanel client={client} />;
}
