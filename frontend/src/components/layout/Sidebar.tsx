import { NavLink } from 'react-router-dom';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useInstanceStore } from '../../stores/instanceStore';

export default function Sidebar() {
  const { connected } = useWebSocket();
  const instances = useInstanceStore((s) => s.instances);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <aside className="w-56 h-screen bg-[#0d0d0d] border-r border-gray-800 flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold tracking-tight">NeoCraft</h1>
        <p className="text-xs text-gray-500 mt-0.5">Minecraft Server Panel</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={linkClass}>
          🖥 Dashboard
        </NavLink>
        <NavLink to="/setup" className={linkClass}>
          ➕ New Server
        </NavLink>

        {instances.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="px-4 text-xs text-gray-500 uppercase tracking-wider mb-2">Servers</p>
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
                    Console
                  </NavLink>
                  <NavLink to={`/config/${inst.id}`} className="text-xs text-gray-500 hover:text-gray-300">
                    Config
                  </NavLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-gray-500">
            {connected ? 'Daemon Connected' : 'Daemon Offline'}
          </span>
        </div>
      </div>
    </aside>
  );
}
