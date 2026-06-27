import { contextBridge, ipcRenderer } from 'electron';
import type { AuntieSettings } from '../shared/types';

const auntie = {
  // settings
  getSettings: (): Promise<AuntieSettings> => ipcRenderer.invoke('auntie:get-settings'),
  setSettings: (s: AuntieSettings): Promise<boolean> => ipcRenderer.invoke('auntie:set-settings', s),

  // SEE
  startSnip: () => ipcRenderer.send('auntie:start-snip'),
  onSnipResult: (cb: (payload: { dataUrl: string; width: number; height: number }) => void) => {
    const handler = (_e: unknown, payload: { dataUrl: string; width: number; height: number }) => cb(payload);
    ipcRenderer.on('auntie:snip-result', handler);
    return () => ipcRenderer.off('auntie:snip-result', handler);
  },
  onSnipError: (cb: (message: string) => void) => {
    const handler = (_e: unknown, message: string) => cb(message);
    ipcRenderer.on('auntie:snip-error', handler);
    return () => ipcRenderer.off('auntie:snip-error', handler);
  },
  // snip window → main
  snipComplete: (rect: { x: number; y: number; width: number; height: number } | null) =>
    ipcRenderer.send('auntie:snip-complete', rect),
  snipCancel: () => ipcRenderer.send('auntie:snip-cancel'),
  // snip UI asks for the captured screenshot to use as its background
  getSnipBackground: (): Promise<string | null> => ipcRenderer.invoke('auntie:get-snip-background'),

  // LISTEN
  getAudioSource: (): Promise<{ id: string; name: string } | null> =>
    ipcRenderer.invoke('auntie:get-audio-source'),
  onToggleListen: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('auntie:toggle-listen', handler);
    return () => ipcRenderer.off('auntie:toggle-listen', handler);
  },

  // External links (BEAT)
  openExternal: (url: string) => ipcRenderer.send('auntie:open-external', url),

  // Clipboard (Export) — copied via main for reliability in the overlay window
  copyToClipboard: (text: string): Promise<boolean> => ipcRenderer.invoke('auntie:copy', text),

  // Collapse / expand the overlay window
  setCollapsed: (collapsed: boolean) => ipcRenderer.send('auntie:set-collapsed', collapsed),

  // Demo trigger (Alt+Shift+D) — stage safety net
  onDemoTrigger: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('auntie:demo-trigger', handler);
    return () => ipcRenderer.off('auntie:demo-trigger', handler);
  }
};

contextBridge.exposeInMainWorld('auntie', auntie);

// Type augmentation for renderer code.
export type AuntieBridge = typeof auntie;
