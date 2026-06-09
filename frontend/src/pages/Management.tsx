import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Wrench } from 'lucide-react';
import { useInstanceStore } from '../stores/instanceStore';
import { versionAtLeast } from '../lib/version';
import SmpPanel from '../components/management/SmpPanel';
import RconPanel from '../components/management/RconPanel';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';

export default function Management() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const loading = useInstanceStore((s) => s.loading);
  const instance = instances.find((i) => i.id === id);
  const useSmp = instance ? versionAtLeast(instance.version, 1, 21, 9) : false;
  const isRunning = instance?.state === 'running';

  if (loading) return <LoadingSkeleton lines={4} />;

  if (!instance) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-app-border-light mb-4">
          <Wrench className="w-6 h-6 text-app-text-muted" />
        </div>
        <p className="text-app-text-secondary mb-4">{t('management.notFound')}</p>
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm font-medium text-app-accent hover:text-app-accent-hover transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('management.backToDashboard')}
        </button>
      </div>
    );
  }

  const protocolLabel = useSmp ? 'SMP' : 'RCON';
  const protocolBadge = useSmp
    ? 'bg-app-green-bg text-app-green border-app-accent-border'
    : 'bg-app-blue-bg text-app-blue border-app-blue-bg';

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-4 lg:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-1">
          <ArrowLeft className="w-3 h-3" /> {t('management.backToDashboard')}
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-app-text">{instance.name}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${protocolBadge}`}>
            {protocolLabel}
          </span>
          <span className={`w-2 h-2 rounded-sm ${isRunning ? 'bg-app-green' : 'bg-app-text-muted'}`} title={isRunning ? 'Connected' : 'Disconnected'} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {useSmp ? (
          <SmpPanel instanceId={id!} managementPort={instance.management_port} managementToken={instance.management_token} managementTlsEnabled={instance.management_tls_enabled} />
        ) : (
          <RconPanel instanceId={id!} />
        )}
      </div>
    </div>
  );
}
