export const IPC_CHANNELS = {
  // Main -> Renderer events
  ON_TEXT_UPDATE: 'companion:on-text-update',
  ON_IMAGES_UPDATE: 'companion:on-images-update',
  ON_CONNECTION_CHANGE: 'companion:on-connection-change',
  ON_SETTINGS_CHANGE: 'companion:on-settings-change',

  // Renderer -> Main invokes
  GET_CONNECTION_STATUS: 'companion:get-connection-status',
  CLEAR_TEXT: 'companion:clear-text',
  COPY_TEXT: 'companion:copy-text',
  SEND_REPLY: 'companion:send-reply',
  GET_SESSION_TOKEN: 'companion:get-session-token',
  REGENERATE_SESSION_TOKEN: 'companion:regenerate-session-token',
  SAVE_PREFERENCES: 'companion:save-preferences',
  LOAD_PREFERENCES: 'companion:load-preferences',

  // Window Controls
  WINDOW_MINIMIZE: 'companion:window-minimize',
  WINDOW_MAXIMIZE: 'companion:window-maximize',
  WINDOW_CLOSE: 'companion:window-close',
} as const;

export interface AppPreferences {
  width: number;
  height: number;
  fontSize: number;
  theme: 'light' | 'dark';
  autoScroll?: boolean;
  alwaysOnTop?: boolean;
}

export interface ConnectionStatusPayload {
  connected: boolean;
  statusText: 'Connected' | 'Disconnected' | 'Connecting...';
  port: number;
  sessionToken: string;
  // host:port addresses other machines on the network can use to reach this companion
  addresses: string[];
}
