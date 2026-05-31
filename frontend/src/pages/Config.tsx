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
  'cpu-affinity': 'CPU核心绑定',
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
  'cpu-affinity': 'CPUアフィニティ',
  'java-args': 'JVM引数',
};

function getLabel(key: string, lang: string): string | null {
  if (lang === 'ja') return LABELS_JA[key] || null;
  return LABELS_ZH[key] || null;
}

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
    // If it was newly added via "Add", just remove from edited
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
      // Build the full properties object: base + edits - removed
      const merged = { ...properties, ...edited };
      for (const key of removed) {
        delete merged[key];
      }
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

  // Instance-level config keys (stored in instance.json, not server.properties)
  const INSTANCE_KEYS = new Set(['cpu_affinity', 'java_args']);

  // Group properties by section (based on comments in the template)
  const visibleEntries = Object.entries(merged).filter(
    ([key]) => !removed.has(key) && !INSTANCE_KEYS.has(key)
  );

  if (!instance) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>{t('config.notFound')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-400 hover:underline">
          {t('config.backToDashboard')}
        </button>
      </div>
    );
  }

  const isRunning = instance.state === 'running' || instance.state === 'starting';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-300 mb-1">
            {t('config.backToDashboard')}
          </button>
          <h1 className="text-xl font-bold">{instance.name} — server.properties</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">{t('config.saved')}</span>}
          {error && <span className="text-sm text-red-400 max-w-48 truncate" title={error}>{error}</span>}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? t('config.saving') : t('config.save')}
          </button>
        </div>
      </div>

      {isRunning && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
          {t('config.runningWarning')}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full mb-2" />
          <p className="text-sm">{t('config.loading')}</p>
        </div>
      ) : (
        <>
          {/* Instance-level settings (not stored in server.properties) */}
          {!removed.has('cpu_affinity') && (
            <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <label className="block text-xs text-blue-400 font-medium mb-1">{t('config.cpuAffinity')}</label>
              <input
                type="text"
                value={merged['cpu_affinity'] ?? ''}
                onChange={(e) => handleChange('cpu_affinity', e.target.value)}
                placeholder="e.g. 0-3 or 0,2,4"
                className="w-full p-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono outline-none focus:border-blue-500 text-gray-300"
                spellCheck={false}
              />
              <p className="text-xs text-gray-500 mt-1">{t('config.cpuAffinityHint')}</p>
            </div>
          )}
          {!removed.has('java_args') && (
            <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <label className="block text-xs text-blue-400 font-medium mb-1">{t('config.javaArgs')}</label>
              <input
                type="text"
                value={merged['java_args'] ?? ''}
                onChange={(e) => handleChange('java_args', e.target.value)}
                placeholder="-Xmx2G -Xms1G"
                className="w-full p-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono outline-none focus:border-blue-500 text-gray-300"
                spellCheck={false}
              />
            </div>
          )}

          <div className="space-y-1 mb-4">
            {visibleEntries.map(([key, value]) => (
              <div
                key={key}
                className={`flex items-center gap-2 group p-1.5 rounded transition-colors ${
                  key in edited ? 'bg-yellow-500/5' : 'hover:bg-gray-800/30'
                }`}
              >
                <button
                  onClick={() => handleRemove(key)}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0"
                  title={`Remove ${key}`}
                >
                  ✕
                </button>
                <label
                  className="w-56 text-xs truncate flex-shrink-0"
                  title={key}
                >
                  <span className="font-mono text-gray-400">{key}</span>
                  {getLabel(key, i18n.language) && (
                    <span className="text-gray-500 ml-1">({getLabel(key, i18n.language)})</span>
                  )}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className={`flex-1 p-1.5 rounded bg-gray-800/80 border text-sm outline-none transition-colors font-mono ${
                    key in edited
                      ? 'border-yellow-500/50 text-yellow-200'
                      : 'border-gray-700/50 focus:border-blue-500 text-gray-300'
                  }`}
                  spellCheck={false}
                />
              </div>
            ))}
          </div>

          {/* Removed properties with undo */}
          {removed.size > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">{t('config.removed')}</p>
              {Array.from(removed).filter(k => k in properties).map((key) => (
                <div key={key} className="flex items-center gap-2 text-xs text-gray-500 line-through py-0.5">
                  <button
                    onClick={() => handleUndoRemove(key)}
                    className="text-gray-500 hover:text-blue-400"
                    title={t('config.undoRemove')}
                  >
                    ↩
                  </button>
                  <span className="font-mono">{key}</span>
                  <span>=</span>
                  <span className="font-mono">{properties[key]}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add new property */}
          {showAdd ? (
            <div className="flex items-center gap-2 p-2 rounded bg-blue-500/5 border border-blue-500/20 mb-4">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={t('config.propertyName')}
                className="w-48 p-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <span className="text-gray-500">=</span>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={t('config.value')}
                className="flex-1 p-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button
                onClick={handleAdd}
                disabled={!newKey.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs transition-colors"
              >
                {t('config.add')}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-xs"
              >
                {t('config.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              {t('config.addProperty')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
