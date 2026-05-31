import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';

export default function Console() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useWebSocket(); // ensures WebSocket provider context is active
  const instances = useInstanceStore((s) => s.instances);
  const logs = useInstanceStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  const instance = instances.find((i) => i.id === id);
  const instanceLogs = id ? logs[id] || [] : [];

  // Logs are now captured globally in the WebSocketProvider (H9 fix)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [instanceLogs.length]);

  if (!instance) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>{t('console.notFound')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-400 hover:underline">
          {t('console.backToDashboard')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-300 mb-1">
            {t('console.backToDashboard')}
          </button>
          <h1 className="text-xl font-bold">{instance.name} {t('console.title')}</h1>
        </div>
        <span className={`text-sm ${
          instance.state === 'running' ? 'text-green-400' : 'text-gray-400'
        }`}>
          {t(`console.state.${instance.state}`)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto bg-black rounded-lg border border-gray-700 p-4 font-mono text-sm">
        {instanceLogs.length === 0 ? (
          <p className="text-gray-600">{t('console.waitingOutput')}</p>
        ) : (
          instanceLogs.map((entry, i) => (
            <div key={i} className="text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
              {entry.line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
