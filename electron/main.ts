import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { LocalCompanionWebSocketServer } from './websocket-server.js';
import { IPC_CHANNELS, AppPreferences, ConnectionStatusPayload } from './ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root: the bundled main runs from electron/out/, the source layout from electron/
const PROJECT_ROOT = path.resolve(__dirname, path.basename(__dirname) === 'out' ? '../..' : '..');

// Accept senders from other machines on the network by default; set COMPANION_HOST=127.0.0.1 for this machine only
const WS_HOST = process.env.COMPANION_HOST || '0.0.0.0';
const WS_PORT = process.env.COMPANION_PORT ? parseInt(process.env.COMPANION_PORT, 10) : 8765;

let mainWindow: BrowserWindow | null = null;
let wsServer: LocalCompanionWebSocketServer | null = null;

// Session token is persisted so the sender machine does not need a new token after every restart
const getTokenFilePath = () => path.join(app.getPath('userData'), 'companion-session-token');

function loadOrCreateSessionToken(): string {
  try {
    const file = getTokenFilePath();
    if (fs.existsSync(file)) {
      const token = fs.readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f]{32}$/.test(token)) return token;
    }
  } catch (err) {
    console.warn('Failed to read session token:', err);
  }
  const token = crypto.randomBytes(16).toString('hex');
  saveSessionToken(token);
  return token;
}

function saveSessionToken(token: string) {
  try {
    fs.writeFileSync(getTokenFilePath(), token, 'utf8');
  } catch (err) {
    console.error('Failed to save session token:', err);
  }
}

// host:port addresses a sender on another machine can use to reach this companion
function getReachableAddresses(): string[] {
  if (WS_HOST !== '0.0.0.0') return [`${WS_HOST}:${WS_PORT}`];
  const addresses: string[] = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const info of iface || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(`${info.address}:${WS_PORT}`);
    }
  }
  return addresses;
}

function buildConnectionStatus(connected: boolean): ConnectionStatusPayload {
  return {
    connected,
    statusText: connected ? 'Connected' : 'Disconnected',
    port: WS_PORT,
    sessionToken: wsServer ? wsServer.getSessionToken() : '',
    addresses: getReachableAddresses(),
  };
}

// Preferences storage file (Only store preferences, NEVER received text per spec #13 & #15)
const getPreferencesFilePath = () => path.join(app.getPath('userData'), 'companion-preferences.json');

const DEFAULT_PREFERENCES: AppPreferences = {
  width: 600,
  height: 500,
  fontSize: 16,
  theme: 'dark',
  autoScroll: true,
};

function loadStoredPreferences(): AppPreferences {
  try {
    const file = getPreferencesFilePath();
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) };
    }
  } catch (err) {
    console.warn('Failed to read preferences:', err);
  }
  return DEFAULT_PREFERENCES;
}

function saveStoredPreferences(prefs: Partial<AppPreferences>) {
  try {
    const current = loadStoredPreferences();
    const updated = { ...current, ...prefs };
    fs.writeFileSync(getPreferencesFilePath(), JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save preferences:', err);
  }
}

async function createWindow() {
  const prefs = loadStoredPreferences();

  mainWindow = new BrowserWindow({
    alwaysOnTop: !!prefs.alwaysOnTop,
    width: prefs.width || 600,
    height: prefs.height || 500,
    minWidth: 400,
    minHeight: 350,
    backgroundColor: prefs.theme === 'dark' ? '#0a0a0a' : '#ffffff',
    title: 'Companion',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Track window size and position changes
  mainWindow.on('resize', () => {
    if (!mainWindow) return;
    const [width, height] = mainWindow.getSize();
    saveStoredPreferences({ width, height });
  });

  // Open external links in default browser, not in the companion window
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load Companion React UI
  // In development prefer the Vite dev server; fall back to the built UI in dist/ when it is not
  // running (e.g. on a machine that only runs the desktop companion).
  const loadBuiltUI = () =>
    mainWindow!.loadFile(path.join(PROJECT_ROOT, 'dist', 'index.html'), {
      query: { mode: 'companion' },
    });

  const isDev = !app.isPackaged;
  if (isDev) {
    try {
      await mainWindow.loadURL('http://localhost:3000/?mode=companion');
    } catch {
      console.log('Dev server not reachable on localhost:3000, loading built UI from dist/');
      await loadBuiltUI();
    }
    // DevTools are opt-in: set COMPANION_DEVTOOLS=1 to open them on launch
    if (process.env.COMPANION_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await loadBuiltUI();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIPC() {
  ipcMain.handle(IPC_CHANNELS.GET_CONNECTION_STATUS, (): ConnectionStatusPayload => {
    return buildConnectionStatus(wsServer ? wsServer.isSenderConnected() : false);
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_TEXT, () => {
    // Notify window that text is cleared
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ON_TEXT_UPDATE, {
        text: '',
        timestamp: Date.now(),
      });
      mainWindow.webContents.send(IPC_CHANNELS.ON_IMAGES_UPDATE, { images: [] });
    }
  });

  ipcMain.handle(IPC_CHANNELS.COPY_TEXT, (_event: Electron.IpcMainInvokeEvent, text: string) => {
    try {
      clipboard.writeText(text || '');
      return true;
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_TOKEN, () => {
    return wsServer ? wsServer.getSessionToken() : '';
  });

  ipcMain.handle(IPC_CHANNELS.REGENERATE_SESSION_TOKEN, () => {
    if (!wsServer) return '';
    const token = wsServer.regenerateSessionToken();
    saveSessionToken(token);
    return token;
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_PREFERENCES, (_event: Electron.IpcMainInvokeEvent, prefs: Partial<AppPreferences>) => {
    saveStoredPreferences(prefs);
    // Pin button in the companion window: keep it above other windows (it stays in the taskbar)
    if (typeof prefs.alwaysOnTop === 'boolean' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(prefs.alwaysOnTop);
    }
  });

  // Reply box in the companion window: text is shown on the connected web sender page
  ipcMain.handle(IPC_CHANNELS.SEND_REPLY, (_event: Electron.IpcMainInvokeEvent, text: string) => {
    return wsServer ? wsServer.sendReply(typeof text === 'string' ? text : '') : false;
  });

  ipcMain.handle(IPC_CHANNELS.LOAD_PREFERENCES, () => {
    return loadStoredPreferences();
  });

  // Window Controls
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });
}

async function init() {
  // Start the companion WebSocket service (0.0.0.0:8765 by default so another machine can send text)
  wsServer = new LocalCompanionWebSocketServer({
    port: WS_PORT,
    host: WS_HOST,
    sessionToken: loadOrCreateSessionToken(),
    onTextReceived: (text, metadata) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ON_TEXT_UPDATE, {
          text,
          timestamp: metadata.timestamp,
        });
      }
    },
    onImagesReceived: (images) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ON_IMAGES_UPDATE, { images });
      }
    },
    onSenderStatusChange: (connected) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ON_CONNECTION_CHANGE, buildConnectionStatus(connected));
      }
    },
    onError: (err) => {
      console.error('WebSocket server error:', err.message);
    },
  });

  try {
    await wsServer.start();
  } catch (err: any) {
    console.error(`Unable to start local communication service. Port ${WS_PORT} may already be in use.`, err);
  }

  setupIPC();
  await createWindow();
}

app.whenReady().then(init);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', async () => {
  if (wsServer) {
    await wsServer.stop();
  }
});
