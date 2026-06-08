import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Plus,
  Server,
  Sun,
  Moon,
  Monitor,
  Globe,
  Pickaxe,
  Flame,
  Info,
} from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useInstanceStore } from '../../stores/instanceStore';
import { useTheme } from '../../contexts/ThemeContext';

type Theme = 'light' | 'dark' | 'system' | 'mc-classic' | 'mc-modern';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  const themeCycle: Theme[] = ['light', 'dark', 'mc-classic', 'mc-modern', 'system'];
  const currentIndex = themeCycle.indexOf(theme);
  const next = themeCycle[(currentIndex + 1) % themeCycle.length];
  
  const icons: Record<Theme, React.ReactNode> = {
    'light': <Sun className="w-4 h-4" />,
    'dark': <Moon className="w-4 h-4" />,
    'system': <Monitor className="w-4 h-4" />,
    'mc-classic': <Pickaxe className="w-4 h-4" />,
    'mc-modern': <Flame className="w-4 h-4" />,
  };
  
  const labels: Record<Theme, string> = {
    'light': '浅色模式',
    'dark': '深色模式',
    'system': '跟随系统',
    'mc-classic': 'MC 经典',
    'mc-modern': 'MC 现代',
  };

  return (
    <button
      onClick={() => setTheme(next)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-app-text-secondary hover:text-app-text hover:bg-app-sidebar-hover rounded-lg transition-colors"
      title={labels[theme] + ' — 点击切换'}
    >
      {icons[theme]}
      <span className="hidden sm:inline">{labels[theme]}</span>
    </button>
  );
}

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { wsConnected, daemonConnected } = useWebSocket();
  const instances = useInstanceStore((s) => s.instances);
  const fetchInstances = useInstanceStore((s) => s.fetchInstances);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const toggleLang = () => {
    const next = i18n.language === 'zh-CN' ? 'ja' : 'zh-CN';
    i18n.changeLanguage(next);
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-app-sidebar-active text-app-accent'
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
    <aside className="w-56 h-screen bg-app-sidebar border-r border-app-border flex flex-col flex-shrink-0 select-none transition-theme">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-app-border">
        <div className="flex items-center gap-2">
          <img src="/neocraft-logo.png" alt="NeoCraft" className="w-8 h-8 rounded-md object-contain" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-app-text leading-none">
              {t('app.title')}
            </h1>
            <p className="text-[10px] text-app-text-muted mt-0.5">{t('app.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
          {t('nav.dashboard')}
        </NavLink>
        <NavLink to="/setup" className={linkClass}>
          <Plus className="w-4 h-4 flex-shrink-0" />
          {t('nav.newServer')}
        </NavLink>

        <div className="mt-4 pt-3 border-t border-app-border">
          <NavLink to="/about" className={linkClass}>
            <Info className="w-4 h-4 flex-shrink-0" />
            {t('nav.about')}
          </NavLink>
        </div>

        {/* Server list */}
        {instances.length > 0 && (
          <div className="mt-4 pt-3 border-t border-app-border">
            <div className="flex items-center gap-1.5 px-3 mb-2">
              <Server className="w-3.5 h-3.5 text-app-text-muted" />
              <p className="text-[10px] text-app-text-muted font-semibold uppercase tracking-wider">
                {t('nav.servers')}
              </p>
            </div>
            <div className="space-y-0.5">
              {instances.map((inst) => (
                <div key={inst.id} className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-sm flex-shrink-0 ${
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
      <div className="p-3 border-t border-app-border space-y-1">
        <ThemeToggle />
        <button
          onClick={toggleLang}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-app-text-secondary hover:text-app-text hover:bg-app-sidebar-hover rounded-lg transition-colors"
        >
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          {i18n.language === 'zh-CN' ? '日本語' : '中文'}
        </button>
        <div className="flex items-center gap-2 px-3 py-1">
          <span className={`w-2 h-2 rounded-sm ${statusColor} flex-shrink-0`} />
          <span className="text-[11px] text-app-text-muted truncate">{statusLabel}</span>
        </div>
      </div>
    </aside>
  );
}
