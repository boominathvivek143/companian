import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS, AppPreferences, ConnectionStatusPayload } from './ipc.js';
import type { CompanionIPCBridge, ConnectionState } from '../src/types/companion';

const companionAPI: CompanionIPCBridge = {
  getConnectionStatus: async () => {
    const res: ConnectionStatusPayload = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONNECTION_STATUS);
    return {
      connected: res.connected,
      statusText: res.statusText as ConnectionState,
      port: res.port,
      sessionToken: res.sessionToken,
      addresses: res.addresses || [],
    };
  },
  clearText: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_TEXT),
  copyText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.COPY_TEXT, text),
  sendReply: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.SEND_REPLY, text),
  getSessionToken: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_TOKEN),
  regenerateSessionToken: () => ipcRenderer.invoke(IPC_CHANNELS.REGENERATE_SESSION_TOKEN),
  savePreferences: (prefs) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_PREFERENCES, prefs),
  loadPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_PREFERENCES),

  minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),

  onTextUpdate: (callback) => {
    const subscription = (_event: IpcRendererEvent, data: { text: string; timestamp: number }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ON_TEXT_UPDATE, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ON_TEXT_UPDATE, subscription);
    };
  },

  onImagesUpdate: (callback) => {
    const subscription = (_event: IpcRendererEvent, data: { images: string[] }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ON_IMAGES_UPDATE, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ON_IMAGES_UPDATE, subscription);
    };
  },

  onConnectionChange: (callback) => {
    const subscription = (_event: IpcRendererEvent, status: ConnectionStatusPayload) => {
      callback({
        connected: status.connected,
        statusText: status.statusText as ConnectionState,
        port: status.port,
        sessionToken: status.sessionToken,
        addresses: status.addresses || [],
      });
    };
    ipcRenderer.on(IPC_CHANNELS.ON_CONNECTION_CHANGE, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ON_CONNECTION_CHANGE, subscription);
    };
  },
};

contextBridge.exposeInMainWorld('companion', companionAPI);
