export type ConnectionState = 'Connected' | 'Disconnected' | 'Connecting...';

export interface AppPreferences {
  width: number;
  height: number;
  fontSize: number; // 12px to 32px
  theme: 'light' | 'dark';
  autoScroll: boolean;
}

export interface WsMessagePayload {
  type:
    | 'TEXT_UPDATE'
    | 'PING'
    | 'PONG'
    | 'AUTH'
    | 'AUTH_SUCCESS'
    | 'AUTH_FAILED'
    | 'ACK'
    | 'SENDER_ASSIGNED'
    | 'WARNING_MULTIPLE_SENDERS'
    | 'CLAIM_ACTIVE_SENDER'
    | 'SENDER_STATUS'
    | 'TOKEN_REFRESHED'
    | 'ERROR';
  text?: string;
  token?: string;
  timestamp?: number;
  charCount?: number;
  isActive?: boolean;
  connected?: boolean;
  senderId?: string | null;
  message?: string;
  code?: string;
}

export interface CompanionIPCBridge {
  getConnectionStatus: () => Promise<{
    connected: boolean;
    statusText: ConnectionState;
    port: number;
    sessionToken: string;
  }>;
  clearText: () => Promise<void>;
  copyText: (text: string) => Promise<boolean>;
  getSessionToken: () => Promise<string>;
  regenerateSessionToken: () => Promise<string>;
  savePreferences: (prefs: Partial<AppPreferences>) => Promise<void>;
  loadPreferences: () => Promise<AppPreferences>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onTextUpdate: (callback: (data: { text: string; timestamp: number }) => void) => () => void;
  onConnectionChange: (
    callback: (status: {
      connected: boolean;
      statusText: ConnectionState;
      port: number;
      sessionToken: string;
    }) => void
  ) => () => void;
}

declare global {
  interface Window {
    companion?: CompanionIPCBridge;
  }
}
