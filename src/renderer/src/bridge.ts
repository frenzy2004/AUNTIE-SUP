import type { AuntieBridge } from '../../preload';
import type { AuntieSettings } from '@shared/types';

const off = () => {};

const browserBridge: AuntieBridge = {
  getSettings: async (): Promise<AuntieSettings> => ({}),
  setSettings: async () => true,
  startSnip: () => {},
  onSnipResult: () => off,
  onSnipError: () => off,
  snipComplete: () => {},
  snipCancel: () => {},
  getSnipBackground: async () => null,
  getAudioSource: async () => null,
  onToggleListen: () => off,
  openExternal: url => {
    globalThis.open?.(url, '_blank', 'noopener,noreferrer');
  },
  copyToClipboard: async text => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  },
  setCollapsed: () => {},
  onDemoTrigger: () => off
};

export const auntie: AuntieBridge = window.auntie ?? browserBridge;
