import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInstanceStore } from '../stores/instanceStore';
import * as api from '../lib/api';

export default function Config() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const instance = instances.find((i) => i.id === id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getConfig(id)
      .then((props) => {
        setProperties(props);
        setEdited({});
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load config'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (key: string, value: string) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!id || Object.keys(edited).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateConfig(id, edited);
      setProperties((prev) => ({ ...prev, ...edited }));
      setEdited({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const merged = { ...properties, ...edited };
  const hasChanges = Object.keys(edited).length > 0;

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
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-300 mb-1">
            &larr; Dashboard
          </button>
          <h1 className="text-xl font-bold">{instance.name} Config</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">Saved</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading config...</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(merged).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <label className="w-48 text-sm text-gray-400 truncate flex-shrink-0" title={key}>
                {key}
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
                className={`flex-1 p-2 rounded bg-gray-800 border text-sm outline-none transition-colors ${
                  key in edited
                    ? 'border-yellow-500/50'
                    : 'border-gray-700 focus:border-blue-500'
                }`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
