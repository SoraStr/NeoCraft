import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { versionAtLeast } from '../lib/version';
import SmpPanel from '../components/management/SmpPanel';
import RconPanel from '../components/management/RconPanel';

/* ── Inline SVG icons ── */

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWrench({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.5 4.5l-3-3L4 0l3 3a4.5 4.5 0 016.56 6.06l-2.12 2.12A4.5 4.5 0 015.5 4.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

/* ── Management ── */

export default function Management() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);

  const instance = instances.find((i) => i.id === id);
  const useRcon = instance ? versionAtLeast(instance.version, 1, 21, 9) : false;
  const isRunning = instance?.state === 'running';

  if (!instance) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-app-border-light mb-4">
          <IconWrench className="w-6 h-6 text-app-text-muted" />
        </div>
        <p className="text-app-text-secondary mb-4">{t('management.notFound')}</p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-app-accent hover:text-app-accent-hover transition-colors"
        >
          <IconBack className="w-3.5 h-3.5" />
          {t('management.backToDashboard')}
        </button>
      </div>
    );
  }

  const protocolLabel = useRcon ? 'RCON' : 'SMP';
  const protocolBadge = useRcon
    ? 'bg-blue-50 text-blue-600 border-blue-200'
    : 'bg-app-green-bg text-app-green border-app-accent-border';

  const connectionDot = isRunning
    ? 'bg-app-green'
    : 'bg-app-text-muted';

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6 animate-fade-in">
      {/* Header */}
      <div className="flex-shrink-0 mb-6">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-1"
        >
          <IconBack className="w-3 h-3" />
          {t('management.backToDashboard')}
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-app-text">{instance.name}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${protocolBadge}`}>
            {protocolLabel}
          </span>
          <span className={`w-2 h-2 rounded-full ${connectionDot}`} title={isRunning ? 'Connected' : 'Disconnected'} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {useRcon ? (
          <RconPanel instanceId={id!} />
        ) : (
          <SmpPanel instanceId={id!} />
        )}
      </div>
    </div>
  );
}
