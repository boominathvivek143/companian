import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionState, WsMessagePayload } from '../types/companion';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Trash2, Send, ShieldAlert, Key, Check, AlertTriangle, FileText, Code2, Bug, Layers } from 'lucide-react';

interface WebSenderProps {
  initialToken?: string;
  onTextLocalSync?: (text: string) => void;
  isStandalone?: boolean;
}

export const WebSender: React.FC<WebSenderProps> = ({
  initialToken = '',
  onTextLocalSync,
  isStandalone = false,
}) => {
  const [text, setText] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('Connecting...');
  const [isActiveSender, setIsActiveSender] = useState<boolean>(true);
  const [multipleSendersWarning, setMultipleSendersWarning] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string>(initialToken);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncAckTimestamp, setSyncAckTimestamp] = useState<number | null>(null);
  const [lastSyncedCharCount, setLastSyncedCharCount] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimerRef = useRef<any>(null);

  // Fetch token automatically from server if empty
  useEffect(() => {
    if (!sessionToken) {
      fetch('/api/session-token')
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            setSessionToken(data.token);
          }
        })
        .catch(() => {});
    }
  }, [sessionToken]);

  // Exponential backoff reconnect intervals per spec #19: 0s -> 1s -> 2s -> 5s -> 10s
  const getReconnectDelay = (attempt: number): number => {
    const intervals = [0, 1000, 2000, 5000, 10000];
    return intervals[Math.min(attempt, intervals.length - 1)];
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    setConnectionStatus('Connecting...');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenQuery = sessionToken ? `&token=${encodeURIComponent(sessionToken)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws?role=sender${tokenQuery}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('Connected');
        reconnectAttemptRef.current = 0;
        setMultipleSendersWarning(null);

        // Authenticate with token
        if (sessionToken) {
          ws.send(JSON.stringify({ type: 'AUTH', token: sessionToken }));
        }

        // Keep-alive PING per spec #4
        ws.send(JSON.stringify({ type: 'PING' }));
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessagePayload = JSON.parse(event.data);

          if (data.type === 'PONG') {
            // Heartbeat confirmed
          } else if (data.type === 'AUTH_SUCCESS') {
            setIsAuthenticated(true);
            setAuthError(null);
          } else if (data.type === 'AUTH_FAILED') {
            setIsAuthenticated(false);
            setAuthError(data.message || 'Authentication failed. Please verify session token.');
          } else if (data.type === 'SENDER_ASSIGNED') {
            setIsActiveSender(true);
            setMultipleSendersWarning(null);
            if (data.token) setSessionToken(data.token);
          } else if (data.type === 'WARNING_MULTIPLE_SENDERS') {
            setIsActiveSender(false);
            setMultipleSendersWarning(data.message || 'Another browser session is connected.');
          } else if (data.type === 'ACK') {
            setSyncAckTimestamp(data.timestamp || Date.now());
            if (typeof data.charCount === 'number') {
              setLastSyncedCharCount(data.charCount);
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message from server:', err);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('Disconnected');
        setIsActiveSender(false);

        // Schedule auto-reconnect with backoff
        const delay = getReconnectDelay(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      };

      ws.onerror = (err) => {
        console.error('Sender WebSocket error:', err);
        setConnectionStatus('Disconnected');
      };
    } catch (err) {
      console.error('WebSocket initialization failure:', err);
      setConnectionStatus('Disconnected');
    }
  }, [sessionToken]);

  // Connect on mount & token change
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectWebSocket]);

  // Send text through WebSocket (Debounced 150ms per spec #5)
  const transmitText = useCallback(
    (newText: string, immediate: boolean = false) => {
      // Local immediate sync for simulation views
      if (onTextLocalSync) {
        onTextLocalSync(newText);
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const doSend = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'TEXT_UPDATE',
              text: newText,
              timestamp: Date.now(),
            })
          );
        }
      };

      if (immediate) {
        doSend();
      } else {
        // Debounce ~150ms (between 100ms - 200ms per specification #5)
        debounceTimerRef.current = setTimeout(doSend, 150);
      }
    },
    [onTextLocalSync]
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    transmitText(val, false);
  };

  const handleClear = () => {
    setText('');
    transmitText('', true);
  };

  const handleClaimActiveSender = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'CLAIM_ACTIVE_SENDER' }));
    }
  };

  // Sample Text Presets for Testing
  const applyPreset = (presetText: string) => {
    setText(presetText);
    transmitText(presetText, true);
  };

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split('\n').length : 0;

  return (
    <div className="flex flex-col h-full w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-xl text-neutral-100">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950/70">
        <div>
          <h2 className="text-xs font-semibold tracking-tight text-neutral-200">Text Sender</h2>
          <p className="text-[11px] text-neutral-500">Fast real-time text synchronization to desktop companion</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-400 text-[11px]">Connection:</span>
            <ConnectionStatus
              status={connectionStatus}
              senderActive={isActiveSender}
              onReconnect={() => {
                if (wsRef.current) wsRef.current.close();
                connectWebSocket();
              }}
            />
          </div>
        </div>
      </div>

      {/* Multiple Senders Warning Banner (Spec #11) */}
      {multipleSendersWarning && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-950/60 border-b border-amber-800/80 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{multipleSendersWarning}</span>
          </div>
          <button
            onClick={handleClaimActiveSender}
            className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] transition-colors"
          >
            Claim Active Role
          </button>
        </div>
      )}

      {/* Auth Error Banner */}
      {authError && (
        <div className="flex items-center justify-between px-4 py-2 bg-rose-950/60 border-b border-rose-800/80 text-rose-200 text-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{authError}</span>
          </div>
          <button
            onClick={() => connectWebSocket()}
            className="px-2 py-0.5 rounded bg-rose-700 text-white font-medium text-[11px]"
          >
            Retry Auth
          </button>
        </div>
      )}

      {/* Main Textarea Container */}
      <div className="flex-1 flex flex-col p-4 relative">
        <textarea
          value={text}
          onChange={handleTextChange}
          placeholder="Paste or type your content here... (synchronizes instantly with desktop companion)"
          className="w-full flex-1 p-4 rounded-lg bg-neutral-950 border border-neutral-800 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/50 outline-none text-sm text-neutral-100 placeholder:text-neutral-600 resize-none font-sans leading-relaxed transition-all"
          rows={12}
        />

        {/* Quick Testing Presets Bar */}
        <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-neutral-500">Quick Test:</span>
            <button
              onClick={() =>
                applyPreset(
                  `Desktop Companion Architecture\n\n1. Web Page connects via WebSocket (ws://127.0.0.1:8765).\n2. Real-time text transmission executes with a 150ms debounce.\n3. Electron Main Process routes untrusted input safely through isolated IPC.\n4. Companion Window renders typography with zero latency.`
                )
              }
              className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-[11px] text-neutral-300 transition-colors flex items-center gap-1"
            >
              <FileText className="w-3 h-3 text-indigo-400" />
              <span>Multi-line Prose</span>
            </button>

            <button
              onClick={() =>
                applyPreset(
                  `// Electron Preload Security Context Bridge\nimport { contextBridge, ipcRenderer } from 'electron';\n\ncontextBridge.exposeInMainWorld('companion', {\n  getConnectionStatus: () => ipcRenderer.invoke('companion:status'),\n  clearText: () => ipcRenderer.invoke('companion:clear'),\n  onTextUpdate: (cb) => ipcRenderer.on('companion:text', cb)\n});`
                )
              }
              className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-[11px] text-neutral-300 transition-colors flex items-center gap-1"
            >
              <Code2 className="w-3 h-3 text-emerald-400" />
              <span>Code Snippet</span>
            </button>

            <button
              onClick={() =>
                applyPreset(
                  `<script>alert("test security")</script>\n<img src="x" onerror="alert(1)">\nPlain text untrusted escaping test verified.`
                )
              }
              className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-[11px] text-neutral-300 transition-colors flex items-center gap-1"
              title="Test untrusted HTML escaping per Spec #7"
            >
              <Bug className="w-3 h-3 text-amber-400" />
              <span>HTML Security Test</span>
            </button>

            <button
              onClick={() => {
                const paragraph = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n`;
                applyPreset(paragraph.repeat(10));
              }}
              className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-[11px] text-neutral-300 transition-colors flex items-center gap-1"
            >
              <Layers className="w-3 h-3 text-purple-400" />
              <span>Large Text (5KB)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Footer Status & Controls (Specification #10) */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800 bg-neutral-950/90 text-xs">
        {/* Dynamic Character & Word Counters */}
        <div className="flex items-center gap-3 tabular-nums text-neutral-400 font-mono text-[11px]">
          <span className="font-semibold text-neutral-200">
            Characters: {charCount.toLocaleString()}
          </span>
          <span>·</span>
          <span>Words: {wordCount.toLocaleString()}</span>
          <span>·</span>
          <span>Lines: {lineCount.toLocaleString()}</span>
          {syncAckTimestamp && (
            <>
              <span>·</span>
              <span className="text-emerald-400 flex items-center gap-1 font-sans">
                <Check className="w-3 h-3" />
                Synced ({lastSyncedCharCount.toLocaleString()} chars)
              </span>
            </>
          )}
        </div>

        {/* Clear Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={charCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 font-medium text-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
};
