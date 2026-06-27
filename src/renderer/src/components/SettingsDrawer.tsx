import React, { useEffect, useState } from 'react';
import type { AuntieSettings } from '@shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AuntieSettings>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) window.auntie.getSettings().then(setSettings);
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    await window.auntie.setSettings(settings);
    setSaving(false);
    onClose();
  };

  return (
    <div className="settings">
      <h2>Keys</h2>
      <p>Stored locally via electron-store. Never sent anywhere except their respective APIs.</p>

      <div className="field">
        <label>OpenAI</label>
        <input
          type="password"
          placeholder="sk-..."
          value={settings.openaiKey ?? ''}
          onChange={e => setSettings(s => ({ ...s, openaiKey: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>Apify (scrape script)</label>
        <input
          type="password"
          placeholder="apify_api_..."
          value={settings.apifyToken ?? ''}
          onChange={e => setSettings(s => ({ ...s, apifyToken: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>Exa (scrape script)</label>
        <input
          type="password"
          placeholder="..."
          value={settings.exaKey ?? ''}
          onChange={e => setSettings(s => ({ ...s, exaKey: e.target.value }))}
        />
      </div>

      <div className="row">
        <button className="action-btn" onClick={onClose}>Cancel</button>
        <button className="action-btn primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
