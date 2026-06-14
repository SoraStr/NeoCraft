import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Save,
  Check,
  X,
  Undo2,
  Plus,
  Wand2,
  AlertTriangle,
  Loader2,
  Search,
  Settings,
} from 'lucide-react';
import { useInstanceStore } from '../stores/instanceStore';
import { MotdGeneratorDialog } from '../components/config/MotdGeneratorDialog';
import { JvmArgsDialog } from '../components/config/JvmArgsDialog';
import { ModsTab } from '../components/management/ModsTab';
import { extractMinecraftVersion } from '../lib/version';
import type { JavaInstallation } from '../lib/types';
import * as api from '../lib/api';

interface JavaPreset {
  key: string;
  labelKey: string;
  description: string;
  args: string;
}

const JAVA_PRESETS: JavaPreset[] = [
  { key: 'low', labelKey: 'setup.presetLow', description: '2G/2人', args: '-Xmx2G -Xms1G -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20' },
  { key: 'medium', labelKey: 'setup.presetMedium', description: '4G/10人', args: '-Xmx4G -Xms2G -XX:+UseG1GC -XX:+ParallelRefProcEnabled' },
  { key: 'high', labelKey: 'setup.presetHigh', description: '8G/50人', args: '-Xmx8G -Xms4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90' },
];

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
  const [activeTab, setActiveTab] = useState<'properties' | 'mods'>('properties');
  const [showMotdGenerator, setShowMotdGenerator] = useState(false);
  const [javaVersions, setJavaVersions] = useState<JavaInstallation[]>([]);
  const [javaDetecting, setJavaDetecting] = useState(false);
  const [showJvmDialog, setShowJvmDialog] = useState(false);

  const handleDetectJava = async () => {
    setJavaDetecting(true);
    try {
      const versions = await api.getJavaVersions();
      setJavaVersions(versions);
    } catch {
      setJavaVersions([]);
    } finally {
      setJavaDetecting(false);
    }
  };

  const getJavaCompat = (major: number) => {
    const mcVersion = extractMinecraftVersion(instance?.version || '');
    if (!mcVersion) return 'ok';
    const parts = mcVersion.split('.').map(Number);
    const mcMinor = parts[1] || 0;
    if (mcMinor >= 21) return major >= 21 ? 'ok' : major >= 17 ? 'warn' : 'bad';
    if (mcMinor >= 18) return major >= 17 ? 'ok' : major >= 11 ? 'warn' : 'bad';
    if (mcMinor >= 17) return major >= 17 ? 'ok' : major >= 16 ? 'warn' : 'bad';
    return major >= 8 ? 'ok' : 'bad';
  };

  const instance = instances.find((i) => i.id === id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.getConfig(id)
      .then((props) => { setProperties(props); setEdited({}); setRemoved(new Set()); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('config.loadingFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleChange = (key: string, value: string) => { setEdited((prev) => ({ ...prev, [key]: value })); setSaved(false); };
  const handleRemove = (key: string) => { setRemoved((prev) => new Set([...prev, key])); if (key in edited && !(key in properties)) { const next = { ...edited }; delete next[key]; setEdited(next); } setSaved(false); };
  const handleUndoRemove = (key: string) => { setRemoved((prev) => { const next = new Set(prev); next.delete(key); return next; }); };
  const handleAdd = () => { if (!newKey.trim()) return; setEdited((prev) => ({ ...prev, [newKey.trim()]: newValue })); setNewKey(''); setNewValue(''); setShowAdd(false); setSaved(false); };
  const handleApplyMotd = (value: string) => { handleChange('motd', value); setShowMotdGenerator(false); };

  const handleSave = async () => {
    if (!id) return;
    const snapshotEdited = { ...edited };
    const snapshotRemoved = new Set(removed);
    const snapshotProps = { ...properties };
    setSaving(true);
    setError(null);
    try {
      const merged = { ...snapshotProps, ...snapshotEdited };
      for (const key of snapshotRemoved) delete merged[key];
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
  const INSTANCE_KEYS = new Set(['java_args', 'java_path']);
  const visibleEntries = Object.entries(merged).filter(([key]) => !removed.has(key) && !INSTANCE_KEYS.has(key));

  if (!instance) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-app-border-light mb-4">
          <Settings className="w-6 h-6 text-app-text-muted" />
        </div>
        <p className="text-app-text-secondary mb-4">{t('config.notFound')}</p>
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm font-medium text-app-accent hover:text-app-accent-hover transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('config.backToDashboard')}
        </button>
      </div>
    );
  }

  const isRunning = instance.state === 'running' || instance.state === 'starting';

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-1">
            <ArrowLeft className="w-3 h-3" /> {t('config.backToDashboard')}
          </button>
          <h1 className="text-xl font-bold text-app-text">
            {instance.name} <span className="text-app-text-muted font-medium ml-2">— {t('config.serverProperties')}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-app-green animate-fade-in"><Check className="w-4 h-4" /> {t('config.saved')}</span>}
          {error && <span className="text-sm text-app-red max-w-48 truncate font-medium" title={error}>{error}</span>}
          {activeTab === 'properties' && (
            <button onClick={handleSave} disabled={!hasChanges || saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors">
              <Save className="w-4 h-4" /> {saving ? t('config.saving') : t('config.save')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-app-border mb-6">
        <div className="flex gap-0.5">
          <button onClick={() => setActiveTab('properties')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'properties' ? 'border-app-accent text-app-accent' : 'border-transparent text-app-text-muted hover:text-app-text-secondary'}`}>
            {t('config.serverProperties')}
          </button>
          <button onClick={() => setActiveTab('mods')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'mods' ? 'border-app-accent text-app-accent' : 'border-transparent text-app-text-muted hover:text-app-text-secondary'}`}>
            {instance.type === 'paper' || instance.type === 'spigot' ? t('mods.plugins') : t('mods.mods')}
          </button>
        </div>
      </div>

      {activeTab === 'properties' && (
        <>
          {isRunning && (
            <div className="mb-6 p-4 rounded-lg bg-app-amber-bg border border-amber-200 dark:border-amber-800 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-app-amber flex-shrink-0" />
              <span className="text-sm text-app-amber font-medium">{t('config.runningWarning')}</span>
            </div>
          )}
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="w-7 h-7 text-app-accent animate-spin mx-auto mb-3" />
              <p className="text-sm text-app-text-secondary">{t('config.loading')}</p>
            </div>
          ) : (
            <>
              {/* Instance-level settings */}
              <div className="mb-8 space-y-4">
                <h3 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">{t('config.instanceSettings')}</h3>
                {!removed.has('java_args') && (
                  <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                    <label className="block text-sm font-semibold text-app-text mb-1.5">{t('config.javaArgs')}</label>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {JAVA_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => handleChange('java_args', preset.args)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                            (merged['java_args'] ?? '') === preset.args
                              ? 'bg-app-accent text-white border-app-accent'
                              : 'bg-app-input text-app-text-secondary border-app-border hover:border-app-accent hover:text-app-text'
                          }`}
                          title={preset.description}
                        >
                          {t(preset.labelKey) || preset.description}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowJvmDialog(true)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors bg-app-input text-app-text-secondary border-app-border hover:border-app-accent hover:text-app-text"
                      >
                        {t('setup.presetCustom') || '自定义'}
                      </button>
                    </div>
                    <input type="text" value={merged['java_args'] ?? ''} onChange={(e) => handleChange('java_args', e.target.value)} placeholder="-Xmx2G -Xms1G" className="w-full px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm font-mono outline-none transition-colors" spellCheck={false} />
                  </div>
                )}
                {!removed.has('java_path') && (
                  <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                    <label className="block text-sm font-semibold text-app-text mb-1.5">{t('config.javaPath')}</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={handleDetectJava}
                        disabled={javaDetecting}
                        className="px-3 py-2 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm border border-app-border transition-colors flex items-center gap-1.5 flex-shrink-0"
                      >
                        {javaDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {t('setup.detectJava') || '检测 Java'}
                      </button>
                      {javaVersions.length > 0 && (
                        <select
                          value={merged['java_path'] ?? ''}
                          onChange={(e) => handleChange('java_path', e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent outline-none text-sm font-mono text-app-text transition-colors truncate"
                        >
                          <option value="java">java (默认)</option>
                          {javaVersions.map((jv) => {
                            const compat = getJavaCompat(jv.major_version);
                            const badge = compat === 'ok' ? ' ✓' : compat === 'warn' ? ' ⚠' : ' ✗';
                            return (
                              <option key={jv.path} value={jv.path}>
                                Java {jv.major_version} ({jv.vendor}) — {jv.path}{badge}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                    <input type="text" value={merged['java_path'] ?? ''} onChange={(e) => handleChange('java_path', e.target.value)} placeholder="java" className="w-full px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm font-mono outline-none transition-colors" spellCheck={false} />
                    {javaVersions.length > 0 && (() => {
                      const selected = javaVersions.find(jv => jv.path === (merged['java_path'] ?? ''));
                      if (!selected) return null;
                      const compat = getJavaCompat(selected.major_version);
                      const mcVersion = extractMinecraftVersion(instance?.version || '');
                      if (compat === 'ok') return <p className="text-xs text-app-green mt-1">✓ Java {selected.major_version} — 与 Minecraft {mcVersion} 兼容</p>;
                      if (compat === 'warn') return <p className="text-xs text-app-amber mt-1">⚠ Java {selected.major_version} — 可能不兼容 Minecraft {mcVersion}，建议升级</p>;
                      return <p className="text-xs text-app-red mt-1">✗ Java {selected.major_version} — 不兼容 Minecraft {mcVersion}</p>;
                    })()}
                  </div>
                )}
              </div>

              {/* Properties table */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-3">{t('config.serverProperties')}</h3>
                <div className="rounded-lg bg-app-surface border border-app-border overflow-hidden">
                  {visibleEntries.length === 0 ? (
                    <div className="p-8 text-center text-sm text-app-text-muted">{t('config.noProperties')}</div>
                  ) : (
                    <div>
                      {visibleEntries.map(([key, value], idx) => (
                        <div key={key} className={`flex items-center gap-3 group px-4 py-2.5 transition-colors ${key in edited ? 'bg-app-amber-bg/50' : 'hover:bg-app-bg'} ${idx < visibleEntries.length - 1 ? 'border-b border-app-border-light' : ''}`}>
                          <button onClick={() => handleRemove(key)} className="text-app-text-muted hover:text-app-red opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title={`Remove ${key}`}><X className="w-3.5 h-3.5" /></button>
                          <label className="w-48 flex-shrink-0 leading-tight" title={key}>
                            <div className="text-xs font-mono text-app-text-secondary font-medium truncate">{key}</div>
                            <div className="text-[11px] text-app-text-muted truncate">{getLabel(key, i18n.language) || '\u00A0'}</div>
                          </label>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <input type="text" value={value} onChange={(e) => handleChange(key, e.target.value)} className={`min-w-0 flex-1 px-2.5 py-1.5 rounded-md bg-app-input border text-sm outline-none transition-colors font-mono ${key in edited ? 'border-amber-300 dark:border-amber-600 text-app-text' : 'border-transparent focus:border-app-accent focus:bg-app-input-focus'}`} spellCheck={false} />
                            {key === 'motd' && (
                              <button type="button" onClick={() => setShowMotdGenerator(true)} className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-app-border bg-app-input text-app-text-muted hover:bg-app-accent-bg hover:border-app-accent-border hover:text-app-accent transition-colors" title={t('config.motdGenerator.open')}>
                                <Wand2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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
                        <button onClick={() => handleUndoRemove(key)} className="text-app-text-muted hover:text-app-accent transition-colors"><Undo2 className="w-3.5 h-3.5" /></button>
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
                <div className="flex items-center gap-3 p-3 rounded-lg bg-app-accent-bg border border-app-accent-border mb-4">
                  <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={t('config.propertyName')} className="w-48 px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent text-sm font-mono outline-none transition-colors" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} autoFocus />
                  <span className="text-app-text-muted font-medium">=</span>
                  <input type="text" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={t('config.value')} className="flex-1 px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent text-sm font-mono outline-none transition-colors" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
                  <button onClick={handleAdd} disabled={!newKey.trim()} className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">{t('config.add')}</button>
                  <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-app-text-muted hover:text-app-text-secondary text-sm transition-colors">{t('config.cancel')}</button>
                </div>
              ) : (
                <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-app-text-muted hover:text-app-accent transition-colors">
                  <Plus className="w-3.5 h-3.5" /> {t('config.addProperty')}
                </button>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'mods' && (
        <ModsTab
          instanceId={id!}
          serverType={instance.type}
          gameVersion={extractMinecraftVersion(instance.version)}
        />
      )}

      <MotdGeneratorDialog open={showMotdGenerator} initialValue={merged.motd ?? ''} onApply={handleApplyMotd} onClose={() => setShowMotdGenerator(false)} />
      <JvmArgsDialog
        open={showJvmDialog}
        initialArgs={merged['java_args'] ?? ''}
        onClose={() => setShowJvmDialog(false)}
        onApply={(args) => { handleChange('java_args', args); setShowJvmDialog(false); }}
      />
    </div>
  );
}
