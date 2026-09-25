import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { LocalCompanionWebSocketServer } from './websocket-server.js';
import { IPC_CHANNELS, AppPreferences, ConnectionStatusPayload } from './ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let wsServer: LocalCompanionWebSocketServer | null = null;

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
  const isDev = !app.isPackaged;
  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000/?mode=companion');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: 'companion' },
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIPC() {
  ipcMain.handle(IPC_CHANNELS.GET_CONNECTION_STATUS, (): ConnectionStatusPayload => {
    const isConnected = wsServer ? wsServer.isSenderConnected() : false;
    return {
      connected: isConnected,
      statusText: isConnected ? 'Connected' : 'Disconnected',
      port: 8765,
      sessionToken: wsServer ? wsServer.getSessionToken() : '',
    };
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_TEXT, () => {
    // Notify window that text is cleared
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ON_TEXT_UPDATE, {
        text: '',
        timestamp: Date.now(),
      });
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
    return wsServer ? wsServer.regenerateSessionToken() : '';
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_PREFERENCES, (_event: Electron.IpcMainInvokeEvent, prefs: Partial<AppPreferences>) => {
    saveStoredPreferences(prefs);
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
  // Start Local WebSocket Server on 127.0.0.1:8765
  wsServer = new LocalCompanionWebSocketServer({
    port: 8765,
    host: '127.0.0.1',
    onTextReceived: (text, metadata) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ON_TEXT_UPDATE, {
          text,
          timestamp: metadata.timestamp,
        });
      }
    },
    onSenderStatusChange: (connected) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const payload: ConnectionStatusPayload = {
          connected,
          statusText: connected ? 'Connected' : 'Disconnected',
          port: 8765,
          sessionToken: wsServer?.getSessionToken() || '',
        };
        mainWindow.webContents.send(IPC_CHANNELS.ON_CONNECTION_CHANGE, payload);
      }
    },
    onError: (err) => {
      console.error('WebSocket server error:', err.message);
    },
  });

  try {
    await wsServer.start();
  } catch (err: any) {
    console.error('Unable to start local communication service. Port 8765 may already be in use.', err);
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
