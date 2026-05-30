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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load config'))
      .finally(() => setLoading(false));
  }, [id]);

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
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const merged = { ...properties, ...edited };
  const hasChanges = Object.keys(edited).length > 0 || removed.size > 0;

  // Group properties by section (based on comments in the template)
  const visibleEntries = Object.entries(merged).filter(([key]) => !removed.has(key));

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

  const isRunning = instance.state === 'running' || instance.state === 'starting';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-300 mb-1">
            &larr; Dashboard
          </button>
          <h1 className="text-xl font-bold">{instance.name} — server.properties</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">✓ Saved</span>}
          {error && <span className="text-sm text-red-400 max-w-48 truncate" title={error}>{error}</span>}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {isRunning && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
          ⚠ Server is running. Changes will take effect after restart.
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full mb-2" />
          <p className="text-sm">Loading properties...</p>
        </div>
      ) : (
        <>
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
                  className="w-56 text-xs text-gray-400 truncate flex-shrink-0 font-mono"
                  title={key}
                >
                  {key}
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
              <p className="text-xs text-gray-500 mb-1">Removed (will be deleted on save):</p>
              {Array.from(removed).filter(k => k in properties).map((key) => (
                <div key={key} className="flex items-center gap-2 text-xs text-gray-500 line-through py-0.5">
                  <button
                    onClick={() => handleUndoRemove(key)}
                    className="text-gray-500 hover:text-blue-400"
                    title="Undo remove"
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
                placeholder="property-name"
                className="w-48 p-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <span className="text-gray-500">=</span>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="value"
                className="flex-1 p-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button
                onClick={handleAdd}
                disabled={!newKey.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              <span className="text-base leading-none">+</span> Add property
            </button>
          )}
        </>
      )}
    </div>
  );
}
