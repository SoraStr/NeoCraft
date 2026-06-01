import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useInstanceStore } from '../../stores/instanceStore';

/* ── Inline SVG Icons ── */

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v8M6 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconServer({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="5.5" r="1" fill="currentColor" />
      <rect x="3" y="9.5" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="10" cy="10" rx="3.5" ry="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h16M2 7h16M2 13h16" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}

/* ── Sidebar ── */

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { wsConnected, daemonConnected } = useWebSocket();
  const instances = useInstanceStore((s) => s.instances);

  const toggleLang = () => {
    const next = i18n.language === 'zh-CN' ? 'ja' : 'zh-CN';
    i18n.changeLanguage(next);
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-app-accent-bg text-app-accent'
        : 'text-app-text-secondary hover:text-app-text hover:bg-app-sidebar-hover'
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-xs transition-colors ${
      isActive ? 'text-app-accent font-medium' : 'text-app-text-muted hover:text-app-text-secondary'
    }`;

  const statusColor = daemonConnected ? 'bg-app-green' : wsConnected ? 'bg-app-amber' : 'bg-app-red';
  const statusLabel = daemonConnected
    ? t('status.daemonOnline')
    : wsConnected
    ? t('status.daemonOffline')
    : t('status.disconnected');

  return (
    <aside className="w-56 h-screen bg-app-sidebar border-r border-app-border flex flex-col flex-shrink-0 select-none">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-app-border">
        <h1 className="text-base font-bold tracking-tight text-app-text">
          {t('app.title')}
        </h1>
        <p className="text-xs text-app-text-muted mt-0.5">{t('app.subtitle')}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavLink to="/" end className={linkClass}>
          <IconDashboard className="w-4 h-4 flex-shrink-0" />
          {t('nav.dashboard')}
        </NavLink>
        <NavLink to="/setup" className={linkClass}>
          <IconPlus className="w-4 h-4 flex-shrink-0" />
          {t('nav.newServer')}
        </NavLink>

        {/* Server list */}
        {instances.length > 0 && (
          <div className="mt-5 pt-4 border-t border-app-border">
            <div className="flex items-center gap-1.5 px-3 mb-2">
              <IconServer className="w-3.5 h-3.5 text-app-text-muted" />
              <p className="text-xs text-app-text-muted font-medium uppercase tracking-wider">
                {t('nav.servers')}
              </p>
            </div>
            <div className="space-y-0.5">
              {instances.map((inst) => (
                <div key={inst.id} className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        inst.state === 'running'
                          ? 'bg-app-green'
                          : inst.state === 'starting' || inst.state === 'stopping'
                          ? 'bg-app-amber'
                          : inst.state === 'crashed'
                          ? 'bg-app-red'
                          : 'bg-app-text-muted'
                      }`}
                    />
                    <span className="text-sm text-app-text-secondary truncate font-medium">
                      {inst.name}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 ml-4">
                    <NavLink to={`/console/${inst.id}`} className={subLinkClass}>
                      {t('nav.console')}
                    </NavLink>
                    <NavLink to={`/config/${inst.id}`} className={subLinkClass}>
                      {t('nav.config')}
                    </NavLink>
                    <NavLink to={`/manage/${inst.id}`} className={subLinkClass}>
                      {t('nav.manage')}
                    </NavLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-app-border space-y-2.5">
        <button
          onClick={toggleLang}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-app-text-secondary hover:text-app-text hover:bg-app-sidebar-hover rounded-md transition-colors"
        >
          <IconGlobe className="w-3.5 h-3.5 flex-shrink-0" />
          {i18n.language === 'zh-CN' ? '日本語' : '中文'}
        </button>
        <div className="flex items-center gap-2 px-1">
          <span className={`w-2 h-2 rounded-full ${statusColor} flex-shrink-0`} />
          <span className="text-xs text-app-text-muted truncate">{statusLabel}</span>
        </div>
      </div>
    </aside>
  );
}
