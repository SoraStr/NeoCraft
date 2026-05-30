import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import type { IpcEvent } from '../lib/types';

export default function Console() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { onEvent } = useWebSocket();
  const instances = useInstanceStore((s) => s.instances);
  const logs = useInstanceStore((s) => s.logs);
  const appendLog = useInstanceStore((s) => s.appendLog);
  const bottomRef = useRef<HTMLDivElement>(null);

  const instance = instances.find((i) => i.id === id);
  const instanceLogs = id ? logs[id] || [] : [];

  useEffect(() => {
    if (!id) return;
    return onEvent((event: IpcEvent) => {
      if (event.event === 'instance.log' && event.data.instance_id === id) {
        appendLog(id, {
          instanceId: id,
          line: event.data.line as string,
          timestamp: event.data.timestamp as number,
        });
      }
    });
  }, [id, onEvent, appendLog]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [instanceLogs.length]);

  if (!instance) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>Server not found</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-400 hover:underline">
          &larr; Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-300 mb-1">
            &larr; Dashboard
          </button>
          <h1 className="text-xl font-bold">{instance.name} Console</h1>
        </div>
        <span className={`text-sm ${
          instance.state === 'running' ? 'text-green-400' : 'text-gray-400'
        }`}>
          {instance.state.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto bg-black rounded-lg border border-gray-700 p-4 font-mono text-sm">
        {instanceLogs.length === 0 ? (
          <p className="text-gray-600">Waiting for server output...</p>
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
