import 'dotenv/config';
import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen, nativeImage, shell, clipboard } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Store from 'electron-store';
import { HOTKEYS, WINDOW } from '../shared/config';
import type { AuntieSettings } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const store = new Store<AuntieSettings>({
  name: 'auntie-settings',
  defaults: { openaiKey: '', apifyToken: '', exaKey: '' }
});

let overlayWindow: BrowserWindow | null = null;
let snipWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// The screenshot we captured at the moment the user pressed snip. Drag UI
// renders this as a static background AND we crop from it on release — so
// YouTube blanking itself on focus loss doesn't matter, we have the frame.
let snipScreenshot: { dataUrl: string; width: number; height: number; scaleFactor: number } | null = null;

function reportSnipError(err: unknown): void {
  const message = err instanceof Error ? err.message : 'Could not start snip.';
  console.error('[snip] failed', err);
  snipWindow?.close();
  snipWindow = null;
  overlayWindow?.show();
  overlayWindow?.webContents.send('auntie:snip-error', message);
}

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL'];
}

function rendererUrl(htmlFile: 'index' | 'snip'): string {
  if (isDev()) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${htmlFile}.html`;
  }
  return `file://${join(__dirname, `../renderer/${htmlFile}.html`)}`;
}

function expandedBounds() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primary.workAreaSize;
  return {
    width: WINDOW.width,
    height: screenH,
    x: screenW - WINDOW.width - WINDOW.marginRight,
    y: 0
  };
}

function collapsedBounds() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenW } = primary.workAreaSize;
  return {
    width: WINDOW.pillSize,
    height: WINDOW.pillSize,
    x: screenW - WINDOW.pillSize - WINDOW.marginRight,
    y: WINDOW.pillMarginTop
  };
}

function createOverlayWindow(): void {
  const bounds = expandedBounds();

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The renderer makes direct OpenAI calls (vision, transcribe, reasoning).
      // OpenAI's HTTP endpoints don't return CORS headers, so we disable
      // webSecurity for the overlay window. The renderer only ever loads our
      // own code; no untrusted content is rendered.
      webSecurity: false
    },
    show: false
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show();
  });

  overlayWindow.loadURL(rendererUrl('index'));

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function toggleOverlay(): void {
  if (!overlayWindow) {
    createOverlayWindow();
    return;
  }
  if (overlayWindow.isVisible()) overlayWindow.hide();
  else overlayWindow.show();
}

async function startSnip(): Promise<void> {
  if (snipWindow) return;
  try {
    // Hide the overlay first so it isn't in the captured screenshot.
    if (overlayWindow?.isVisible()) overlayWindow.hide();

    const primary = screen.getPrimaryDisplay();
    const { width: dispW, height: dispH } = primary.size;
    const scaleFactor = primary.scaleFactor || 1;

    // Give Windows a frame to actually hide the overlay before we capture.
    await new Promise(r => setTimeout(r, 80));

    // Capture the screen NOW so YouTube etc. are frozen in time. The drag UI
    // will render this image; on release we crop the same image.
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(dispW * scaleFactor), height: Math.round(dispH * scaleFactor) }
    });
    const screenSrc = sources[0];
    if (!screenSrc) throw new Error('No screen source available. Check Screen Recording permission.');

    const fullImage = screenSrc.thumbnail;
    const dataUrl = `data:image/png;base64,${fullImage.toPNG().toString('base64')}`;
    snipScreenshot = { dataUrl, width: dispW, height: dispH, scaleFactor };

    snipWindow = new BrowserWindow({
      width: dispW,
      height: dispH,
      x: 0,
      y: 0,
      frame: false,
      // Opaque window — we draw the captured screenshot as the background.
      // No transparent-window quirks, no white flash.
      transparent: false,
      alwaysOnTop: true,
      fullscreen: false,
      movable: false,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    snipWindow.on('closed', () => {
      snipWindow = null;
      overlayWindow?.show();
    });
    snipWindow.setAlwaysOnTop(true, 'screen-saver');
    await snipWindow.loadURL(rendererUrl('snip'));
    snipWindow.show();
    snipWindow.focus();
  } catch (err) {
    reportSnipError(err);
  }
}

function createTray(): void {
  // Tiny inline icon so we don't depend on an external asset for the demo.
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  tray = new Tray(icon);
  tray.setToolTip('AUNTIE — trust co-pilot');
  const menu = Menu.buildFromTemplate([
    { label: 'Show / hide overlay', click: () => toggleOverlay() },
    { label: 'Snip product', click: () => startSnip() },
    { type: 'separator' },
    { label: 'Quit AUNTIE', role: 'quit' }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleOverlay());
}

function registerHotkeys(): void {
  globalShortcut.register(HOTKEYS.toggleOverlay, toggleOverlay);
  globalShortcut.register(HOTKEYS.snipProduct, startSnip);
  globalShortcut.register(HOTKEYS.toggleListen, () => {
    overlayWindow?.webContents.send('auntie:toggle-listen');
  });
  globalShortcut.register(HOTKEYS.demoTrigger, () => {
    overlayWindow?.webContents.send('auntie:demo-trigger');
  });
}

// ─── IPC ────────────────────────────────────────────────────────────────────

ipcMain.handle('auntie:get-settings', () => ({
  openaiKey: store.get('openaiKey') || process.env['OPENAI_API_KEY'] || '',
  apifyToken: store.get('apifyToken') || process.env['APIFY_API_TOKEN'] || '',
  exaKey: store.get('exaKey') || process.env['EXA_API_KEY'] || ''
}));

ipcMain.handle('auntie:set-settings', (_e, settings: AuntieSettings) => {
  if (settings.openaiKey !== undefined) store.set('openaiKey', settings.openaiKey);
  if (settings.apifyToken !== undefined) store.set('apifyToken', settings.apifyToken);
  if (settings.exaKey !== undefined) store.set('exaKey', settings.exaKey);
  return true;
});

// Renderer kicks snip from the overlay's snip button.
ipcMain.on('auntie:start-snip', () => { void startSnip(); });

// Snip window reports the user's selection rect (in display coords).
// Main captures the screen, crops, and pushes the PNG back to the overlay.
ipcMain.on('auntie:snip-complete', async (_e, rect: { x: number; y: number; width: number; height: number } | null) => {
  try {
    snipWindow?.close();
    snipWindow = null;
    overlayWindow?.show();
    if (!rect || rect.width < 4 || rect.height < 4 || !snipScreenshot) return;

    // Crop from the screenshot we captured at startSnip — not a fresh capture.
    const fullImage = nativeImage.createFromDataURL(snipScreenshot.dataUrl);
    const { scaleFactor } = snipScreenshot;
    const cropped = fullImage.crop({
      x: Math.round(rect.x * scaleFactor),
      y: Math.round(rect.y * scaleFactor),
      width: Math.round(rect.width * scaleFactor),
      height: Math.round(rect.height * scaleFactor)
    });
    const dataUrl = `data:image/png;base64,${cropped.toPNG().toString('base64')}`;
    overlayWindow?.webContents.send('auntie:snip-result', { dataUrl, width: rect.width, height: rect.height });
  } catch (err) {
    reportSnipError(err);
  }
});

// The snip UI asks for the captured screenshot to render as its background.
ipcMain.handle('auntie:get-snip-background', () => snipScreenshot?.dataUrl ?? null);

// Snip window cancel (Esc).
ipcMain.on('auntie:snip-cancel', () => {
  snipWindow?.close();
  snipWindow = null;
  overlayWindow?.show();
});

// LISTEN: renderer requests the desktop audio source id; main resolves it.
ipcMain.handle('auntie:get-audio-source', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const screenSrc = sources[0];
  return screenSrc ? { id: screenSrc.id, name: screenSrc.name } : null;
});

// Open external URL safely (verified-seller redirect from BEAT card).
ipcMain.on('auntie:open-external', (_e, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

// Collapse / expand the overlay window between full panel and pill.
ipcMain.on('auntie:set-collapsed', (_e, collapsed: boolean) => {
  if (!overlayWindow) return;
  const target = collapsed ? collapsedBounds() : expandedBounds();
  overlayWindow.setBounds(target);
});

// Reliable clipboard write from the always-on-top overlay. navigator.clipboard
// is flaky in a frameless, often-unfocused window, so we copy via main.
ipcMain.handle('auntie:copy', (_e, text: string) => {
  if (typeof text !== 'string') return false;
  clipboard.writeText(text);
  return true;
});

// ─── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createOverlayWindow();
  createTray();
  registerHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', (e: Electron.Event) => {
  // Keep running in tray on Windows/Linux; macOS handles its own.
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ─── Tiny embedded tray icon (16×16 magenta dot) ────────────────────────────
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQUlEQVR4nGNgGAWj' +
  'YBSMglFAFmBkYGAQYGBg+M/AwEDPwMBAaQDS9P//+gYNCkbBKBgFo2AUjIJRMApGwSgYBQA9kQQXVqv7+wAA' +
  'AABJRU5ErkJggg==';
