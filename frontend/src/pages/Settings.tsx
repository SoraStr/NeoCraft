import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Save,
  Check,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import * as api from '../lib/api';

interface PanelSettings {
  host: string;
  port: number;
  allowedHosts: string[];
}

export default function PanelSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<PanelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newHost, setNewHost] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getPanelSettings();
        setSettings(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleChange = (field: string, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setSaved(false);
  };

  const handleAddHost = () => {
    if (!settings || !newHost.trim()) return;
    if (settings.allowedHosts.includes(newHost.trim())) return;
    setSettings({
      ...settings,
      allowedHosts: [...settings.allowedHosts, newHost.trim()],
    });
    setNewHost('');
    setSaved(false);
  };

  const handleRemoveHost = (host: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      allowedHosts: settings.allowedHosts.filter((h) => h !== host),
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await api.updatePanelSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
        <div className="text-center py-16">
          <Loader2 className="w-7 h-7 text-app-accent animate-spin mx-auto mb-3" />
          <p className="text-sm text-app-text-secondary">{t('status.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('setup.back') || '返回'}
      </button>

      <h1 className="text-2xl font-bold tracking-tight mb-2">
        {t('panelSettings.title') || '面板设置'}
      </h1>
      <p className="text-sm text-app-text-secondary mb-8">
        {t('panelSettings.desc') || '修改监听地址、端口和允许访问的域名。部分设置需要重启服务后生效。'}
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-md bg-app-red-bg border border-red-200 dark:border-red-800 text-app-red text-sm">
          {error}
        </div>
      )}

      {settings && (
        <div className="space-y-6">
          {/* Listen host */}
          <div className="p-4 rounded-lg bg-app-surface border border-app-border">
            <label className="block text-sm font-semibold text-app-text mb-1.5">
              {t('panelSettings.host') || '监听地址'}
            </label>
            <select
              value={settings.host}
              onChange={(e) => handleChange('host', e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent outline-none text-sm text-app-text transition-colors"
            >
              <option value="127.0.0.1">127.0.0.1 — {t('panelSettings.localOnly') || '仅本机'}</option>
              <option value="0.0.0.0">0.0.0.0 — {t('panelSettings.allInterfaces') || '所有网络接口'}</option>
            </select>
            <p className="text-xs text-app-text-muted mt-1.5">
              {t('panelSettings.hostHint') || '选择 0.0.0.0 以允许局域网内其他设备访问面板。'}
            </p>
          </div>

          {/* Port */}
          <div className="p-4 rounded-lg bg-app-surface border border-app-border">
            <label className="block text-sm font-semibold text-app-text mb-1.5">
              {t('panelSettings.port') || '端口'}
            </label>
            <input
              type="number"
              value={settings.port}
              onChange={(e) => handleChange('port', parseInt(e.target.value, 10) || 3001)}
              className="w-full px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent outline-none text-sm font-mono text-app-text transition-colors"
            />
            <p className="text-xs text-app-text-muted mt-1.5">
              {t('panelSettings.portHint') || 'API 服务端监听端口，默认 3001。修改后需重启服务。'}
            </p>
          </div>

          {/* Allowed hosts */}
          <div className="p-4 rounded-lg bg-app-surface border border-app-border">
            <label className="block text-sm font-semibold text-app-text mb-1.5">
              {t('panelSettings.allowedHosts') || '允许访问的域名'}
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newHost}
                onChange={(e) => setNewHost(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddHost()}
                placeholder="example.com"
                className="flex-1 px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent outline-none text-sm font-mono text-app-text transition-colors"
              />
              <button
                onClick={handleAddHost}
                disabled={!newHost.trim()}
                className="px-3 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> {t('panelSettings.add') || '添加'}
              </button>
            </div>
            {settings.allowedHosts.length > 0 ? (
              <div className="space-y-1.5">
                {settings.allowedHosts.map((host) => (
                  <div key={host} className="flex items-center justify-between px-3 py-2 rounded-md bg-app-input border border-app-border text-sm">
                    <span className="font-mono text-app-text">{host}</span>
                    <button
                      onClick={() => handleRemoveHost(host)}
                      className="text-app-text-muted hover:text-app-red transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-app-text-muted py-2">
                {t('panelSettings.noHosts') || '暂未添加域名。仅允许本机访问。'}
              </p>
            )}
            <p className="text-xs text-app-text-muted mt-2">
              {t('panelSettings.allowedHostsHint') || '允许通过 Vite 开发服务器访问的域名（仅开发模式生效）。'}
            </p>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors shadow-sm"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('status.saving')}</>
              ) : (
                <><Save className="w-4 h-4" /> {t('panelSettings.save') || '保存设置'}</>
              )}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-app-green">
                <Check className="w-4 h-4" /> {t('status.saved')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
