import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useInstanceStore } from '../../stores/instanceStore';

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { wsConnected, daemonConnected } = useWebSocket();
  const instances = useInstanceStore((s) => s.instances);

  const toggleLang = () => {
    const next = i18n.language === 'zh-CN' ? 'ja' : 'zh-CN';
    i18n.changeLanguage(next);
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <aside className="w-56 h-screen bg-[#0d0d0d] border-r border-gray-800 flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold tracking-tight">{t('app.title')}</h1>
        <p className="text-xs text-gray-500 mt-0.5">{t('app.subtitle')}</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={linkClass}>
          🖥 {t('nav.dashboard')}
        </NavLink>
        <NavLink to="/setup" className={linkClass}>
          ➕ {t('nav.newServer')}
        </NavLink>

        {instances.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="px-4 text-xs text-gray-500 uppercase tracking-wider mb-2">{t('nav.servers')}</p>
            {instances.map((inst) => (
              <div key={inst.id} className="px-4 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    inst.state === 'running' ? 'bg-green-400' :
                    inst.state === 'starting' || inst.state === 'stopping' ? 'bg-yellow-400' :
                    inst.state === 'crashed' ? 'bg-red-400' : 'bg-gray-500'
                  }`} />
                  <span className="text-gray-300 truncate">{inst.name}</span>
                </div>
                <div className="flex gap-2 mt-1 ml-4">
                  <NavLink to={`/console/${inst.id}`} className="text-xs text-gray-500 hover:text-gray-300">
                    {t('nav.console')}
                  </NavLink>
                  <NavLink to={`/config/${inst.id}`} className="text-xs text-gray-500 hover:text-gray-300">
                    {t('nav.config')}
                  </NavLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-gray-800 space-y-2">
        <button
          onClick={toggleLang}
          className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          🌐 {i18n.language === 'zh-CN' ? '日本語' : '中文'}
        </button>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${daemonConnected ? 'bg-green-400' : wsConnected ? 'bg-yellow-400' : 'bg-red-400'}`} />
          <span className="text-gray-500">
            {daemonConnected ? t('status.daemonOnline') : wsConnected ? t('status.daemonOffline') : t('status.disconnected')}
          </span>
        </div>
      </div>
    </aside>
  );
}
