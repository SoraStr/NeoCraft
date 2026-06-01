import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import * as api from '../lib/api';

const LABELS_ZH: Record<string, string> = {
  'server-port': '服务器端口',
  'server-ip': '绑定IP',
  'max-players': '最大玩家数',
  'online-mode': '正版验证',
  'enable-query': '查询协议',
  'enable-rcon': '远程控制台',
  'rcon.port': 'RCON端口',
  'rcon.password': 'RCON密码',
  'gamemode': '默认游戏模式',
  'difficulty': '难度',
  'allow-nether': '允许下界',
  'allow-end': '允许末地',
  'spawn-monsters': '生成怪物',
  'spawn-animals': '生成动物',
  'spawn-npcs': '生成NPC',
  'pvp': '玩家对战',
  'force-gamemode': '强制游戏模式',
  'allow-flight': '允许飞行',
  'level-name': '世界名称',
  'level-seed': '世界种子',
  'generate-structures': '生成结构',
  'max-world-size': '世界边界',
  'level-type': '世界类型',
  'generator-settings': '生成器设置',
  'spawn-protection': '出生点保护',
  'view-distance': '视距',
  'simulation-distance': '模拟距离',
  'entity-broadcast-range-percentage': '实体广播范围',
  'max-tick-time': '最大Tick时间',
  'network-compression-threshold': '网络压缩阈值',
  'sync-chunk-writes': '同步区块写入',
  'use-native-transport': '原生网络传输',
  'motd': '服务器消息',
  'announce-advancements': '广播成就',
  'enable-status': '响应状态请求',
  'broadcast-console-to-ops': '广播控制台到OP',
  'broadcast-rcon-to-ops': '广播RCON到OP',
  'op-permission-level': 'OP权限等级',
  'function-permission-level': '函数权限等级',
  'white-list': '白名单',
  'enforce-whitelist': '强制白名单',
  'enforce-secure-profile': '强制安全档案',
  'prevent-proxy-connections': '阻止代理连接',
  'resource-pack': '资源包URL',
  'require-resource-pack': '强制资源包',
  'text-filtering-config': '聊天过滤配置',
  'snooper-enabled': '匿名数据发送',
  'java-args': 'JVM参数',
};

const LABELS_JA: Record<string, string> = {
  'server-port': 'サーバーポート',
  'max-players': '最大プレイヤー数',
  'online-mode': '正規認証',
  'motd': 'サーバーメッセージ',
  'gamemode': 'ゲームモード',
  'difficulty': '難易度',
  'allow-nether': 'ネザー許可',
  'allow-flight': '飛行許可',
  'level-name': 'ワールド名',
  'level-seed': 'ワールドシード',
  'view-distance': '描画距離',
  'simulation-distance': 'シミュレーション距離',
  'pvp': 'PvP',
  'white-list': 'ホワイトリスト',
  'spawn-protection': 'スポーン保護',
  'enable-rcon': 'RCON',
  'rcon.port': 'RCONポート',
  'rcon.password': 'RCONパスワード',
  'generate-structures': '構造物生成',
  'max-tick-time': '最大ティック時間',
  'spawn-monsters': 'モンスター生成',
  'spawn-animals': '動物生成',
  'op-permission-level': 'OP権限レベル',
  'enforce-whitelist': 'ホワイトリスト強制',
  'resource-pack': 'リソースパックURL',
  'java-args': 'JVM引数',
};

function getLabel(key: string, lang: string): string | null {
  if (lang === 'ja') return LABELS_JA[key] || null;
  return LABELS_ZH[key] || null;
}

/* ── Icons ── */

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 13.5V3a1 1 0 011-1h5l3 3v8.5a1 1 0 01-1 1H5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 2.5V5a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 12.5l2 2 3-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUndo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 6L2 9l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h7a4 4 0 010 8H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Config ── */

export default function Config() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const instance = instances.find((i) => i.id === id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.getConfig(id)
      .then((props) => {
        setProperties(props);
        setEdited({});
        setRemoved(new Set());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('config.loadingFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleChange = (key: string, value: string) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleRemove = (key: string) => {
    setRemoved((prev) => new Set([...prev, key]));
    if (key in edited && !(key in properties)) {
      const next = { ...edited };
      delete next[key];
      setEdited(next);
    }
    setSaved(false);
  };

  const handleUndoRemove = (key: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleAdd = () => {
    if (!newKey.trim()) return;
    setEdited((prev) => ({ ...prev, [newKey.trim()]: newValue }));
    setNewKey('');
    setNewValue('');
    setShowAdd(false);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const merged = { ...properties, ...edited };
      for (const key of removed) delete merged[key];
      await api.updateConfig(id, merged);
      setProperties(merged);
      setEdited({});
      setRemoved(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('config.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const merged = { ...properties, ...edited };
  const hasChanges = Object.keys(edited).length > 0 || removed.size > 0;

  const INSTANCE_KEYS = new Set(['java_args']);

  const visibleEntries = Object.entries(merged).filter(
    ([key]) => !removed.has(key) && !INSTANCE_KEYS.has(key)
  );

  if (!instance) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-app-border-light mb-4">
          <svg className="w-6 h-6 text-app-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 8v4M12 16v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-app-text-secondary mb-4">{t('config.notFound')}</p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-app-accent hover:text-app-accent-hover transition-colors"
        >
          <IconBack className="w-3.5 h-3.5" />
          {t('config.backToDashboard')}
        </button>
      </div>
    );
  }

  const isRunning = instance.state === 'running' || instance.state === 'starting';

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-1"
          >
            <IconBack className="w-3 h-3" />
            {t('config.backToDashboard')}
          </button>
          <h1 className="text-xl font-bold text-app-text">
            {instance.name}
            <span className="text-app-text-muted font-medium ml-2">— server.properties</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-app-green animate-fade-in">
              <IconSave className="w-4 h-4" />
              {t('config.saved')}
            </span>
          )}
          {error && (
            <span className="text-sm text-app-red max-w-48 truncate font-medium" title={error}>{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <IconSave className="w-4 h-4" />
            {saving ? t('config.saving') : t('config.save')}
          </button>
        </div>
      </div>

      {/* Running warning */}
      {isRunning && (
        <div className="mb-6 p-4 rounded-xl bg-app-amber-bg border border-amber-200">
          <div className="flex items-center gap-2.5">
            <svg className="w-4 h-4 text-app-amber flex-shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="14" r="0.75" fill="currentColor" />
            </svg>
            <span className="text-sm text-amber-700 font-medium">{t('config.runningWarning')}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-7 h-7 border-2 border-app-border border-t-app-accent rounded-full animate-spin mb-3" />
          <p className="text-sm text-app-text-secondary">{t('config.loading')}</p>
        </div>
      ) : (
        <>
          {/* Instance-level settings */}
          <div className="mb-8 space-y-4">
            <h3 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">实例设置</h3>

            {!removed.has('java_args') && (
              <div className="p-4 rounded-xl bg-app-surface border border-app-border">
                <label className="block text-sm font-semibold text-app-text mb-1.5">
                  {t('config.javaArgs')}
                </label>
                <input
                  type="text"
                  value={merged['java_args'] ?? ''}
                  onChange={(e) => handleChange('java_args', e.target.value)}
                  placeholder="-Xmx2G -Xms1G"
                  className="w-full px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm font-mono outline-none transition-colors"
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {/* Server properties */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-3">服务器属性</h3>

            <div className="rounded-xl bg-app-surface border border-app-border overflow-hidden">
              {visibleEntries.length === 0 ? (
                <div className="p-8 text-center text-sm text-app-text-muted">
                  没有可显示的属性
                </div>
              ) : (
                <div>
                  {visibleEntries.map(([key, value], idx) => (
                    <div
                      key={key}
                      className={`flex items-center gap-3 group px-4 py-2.5 transition-colors ${
                        key in edited ? 'bg-app-amber-bg/50' : 'hover:bg-app-bg'
                      } ${idx < visibleEntries.length - 1 ? 'border-b border-app-border-light' : ''}`}
                    >
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(key)}
                        className="text-app-text-muted hover:text-app-red opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0"
                        title={`Remove ${key}`}
                        aria-label={`Remove ${key}`}
                      >
                        <IconClose className="w-3.5 h-3.5" />
                      </button>

                      {/* Key */}
                      <label
                        className="w-52 text-xs truncate flex-shrink-0"
                        title={key}
                      >
                        <span className="font-mono text-app-text-secondary font-medium">{key}</span>
                        {getLabel(key, i18n.language) && (
                          <span className="text-app-text-muted ml-1">({getLabel(key, i18n.language)})</span>
                        )}
                      </label>

                      {/* Value */}
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className={`flex-1 px-2.5 py-1.5 rounded-lg bg-app-input border text-sm outline-none transition-colors font-mono ${
                          key in edited
                            ? 'border-amber-300 text-amber-800'
                            : 'border-transparent focus:border-app-accent focus:bg-app-input-focus'
                        }`}
                        spellCheck={false}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Removed properties */}
          {removed.size > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium text-app-text-muted mb-2">{t('config.removed')}</p>
              <div className="space-y-1">
                {Array.from(removed).filter(k => k in properties).map((key) => (
                  <div key={key} className="flex items-center gap-2 text-xs py-1">
                    <button
                      onClick={() => handleUndoRemove(key)}
                      className="text-app-text-muted hover:text-app-accent transition-colors"
                      title={t('config.undoRemove')}
                      aria-label={t('config.undoRemove')}
                    >
                      <IconUndo className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-app-text-muted line-through">{key}</span>
                    <span className="text-app-text-muted">=</span>
                    <span className="font-mono text-app-text-muted line-through">{properties[key]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add property */}
          {showAdd ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-app-accent-bg border border-app-accent-border mb-4">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={t('config.propertyName')}
                className="w-48 px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm font-mono outline-none transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
              <span className="text-app-text-muted font-medium">=</span>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={t('config.value')}
                className="flex-1 px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm font-mono outline-none transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button
                onClick={handleAdd}
                disabled={!newKey.trim()}
                className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {t('config.add')}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 py-2 text-app-text-muted hover:text-app-text-secondary text-sm transition-colors"
              >
                {t('config.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-app-text-muted hover:text-app-accent transition-colors"
            >
              <IconPlus className="w-3.5 h-3.5" />
              {t('config.addProperty')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
