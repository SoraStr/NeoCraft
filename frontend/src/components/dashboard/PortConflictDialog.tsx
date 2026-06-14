import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { PortCheckResult } from '../../lib/types';

interface Props {
  open: boolean;
  result: PortCheckResult | null;
  instanceId: string;
  onClose: () => void;
  onChangePort: () => void;
  onKillProcess: () => void;
  onIgnore: () => void;
}

export function PortConflictDialog({
  open,
  result,
  instanceId: _instanceId,
  onClose,
  onChangePort,
  onKillProcess,
  onIgnore,
}: Props) {
  const { t } = useTranslation();
  if (!open || !result || result.available) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-app-surface rounded-xl shadow-2xl border border-app-border w-full max-w-md m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-app-amber-bg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-app-amber" />
            </div>
            <div>
              <h3 className="font-semibold text-app-text">
                {t('portConflict.title') || '端口已被占用'}
              </h3>
              <p className="text-sm text-app-text-secondary mt-0.5">
                {t('portConflict.desc')?.replace('{port}', String(result.port)) || `端口 ${result.port} 已被占用`}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-md bg-app-input border border-app-border text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-app-text-muted">{t('portConflict.port') || '端口'}</span>
              <span className="font-mono font-medium text-app-text">{result.port}</span>
            </div>
            {result.processName && (
              <div className="flex justify-between mt-1">
                <span className="text-app-text-muted">{t('portConflict.process') || '占用进程'}</span>
                <span className="font-mono text-app-text">
                  {result.processName}{result.processPid ? ` (PID ${result.processPid})` : ''}
                </span>
              </div>
            )}
            {result.suggestion && result.suggestion > 0 && (
              <div className="flex justify-between mt-1">
                <span className="text-app-text-muted">{t('portConflict.suggestion') || '建议端口'}</span>
                <span className="font-mono text-app-green font-medium">{result.suggestion}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={onChangePort}
              className="w-full px-4 py-2.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-md text-sm font-medium transition-colors"
            >
              {t('portConflict.changePortAny') || '更换端口'}
            </button>
            {result.processPid && (
              <button
                onClick={onKillProcess}
                className="w-full px-4 py-2.5 bg-app-red-bg hover:bg-red-100 dark:hover:bg-red-900/30 text-app-red rounded-md text-sm font-medium border border-red-200 dark:border-red-800 transition-colors"
              >
                {t('portConflict.killProcess') || '终止占用进程'}
              </button>
            )}
            <button
              onClick={onIgnore}
              className="w-full px-4 py-2.5 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm transition-colors border border-app-border"
            >
              {t('portConflict.ignore') || '忽略，仍然启动'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
