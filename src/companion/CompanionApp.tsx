import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionState, AppPreferences, WsMessagePayload } from '../types/companion';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Toolbar } from '../components/Toolbar';
import { TextViewer } from '../components/TextViewer';
import { SecurityModal } from '../components/SecurityModal';
import { Minus, Square, X, Settings, Shield, Sparkles } from 'lucide-react';

interface CompanionAppProps {
  isEmbeddedWindow?: boolean; // When rendered inside the split desktop frame
  onCloseSimulated?: () => void;
}

export const CompanionApp: React.FC<CompanionAppProps> = ({
  isEmbeddedWindow = false,
  onCloseSimulated,
}) => {
  const [text, setText] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('Connecting...');
  const [senderActive, setSenderActive] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [port, setPort] = useState<number>(8765);

  // Persistent preferences (theme, fontSize, autoScroll) - NEVER persists text per spec #13 & #15
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    try {
      const saved = localStorage.getItem('companion_preferences');
      if (saved) {
        return {
          width: 600,
          height: 500,
          fontSize: 16,
          theme: 'dark',
          autoScroll: true,
          ...JSON.parse(saved),
        };
      }
    } catch {}
    return {
      width: 600,
      height: 500,
      fontSize: 16,
      theme: 'dark',
      autoScroll: true,
    };
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Save UI preferences to localStorage & Electron IPC if available
  const updatePreferences = useCallback((newPrefs: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...newPrefs };
      try {
        localStorage.setItem('companion_preferences', JSON.stringify(updated));
      } catch {}
      if (window.companion?.savePreferences) {
        window.companion.savePreferences(updated);
      }
      return updated;
    });
  }, []);

  // Fetch token from server if running in web preview
  const fetchSessionToken = async () => {
    try {
      const res = await fetch('/api/session-token');
      if (res.ok) {
        const data = await res.json();
        setSessionToken(data.token);
      }
    } catch (e) {
      console.warn('Could not fetch token from REST endpoint:', e);
    }
  };

  // Setup communication (Native Electron IPC OR Web WebSocket)
  useEffect(() => {
    // Mode 1: Real Electron Environment with IPC
    if (window.companion) {
      // Load stored preferences from Electron
      window.companion.loadPreferences().then((prefs) => {
        if (prefs) updatePreferences(prefs);
      });

      window.companion.getSessionToken().then((token) => {
        if (token) setSessionToken(token);
      });

      // Subscribe to text updates from Electron Main Process
      const unsubscribeText = window.companion.onTextUpdate((data) => {
        setText(data.text);
      });

      // Subscribe to connection status
      const unsubscribeConn = window.companion.onConnectionChange((status) => {
        setConnectionStatus(status.statusText);
        setSenderActive(status.connected);
        setPort(status.port || 8765);
        if (status.sessionToken) setSessionToken(status.sessionToken);
      });

      window.companion.getConnectionStatus().then((status) => {
        setConnectionStatus(status.statusText);
        setSenderActive(status.connected);
        setPort(status.port || 8765);
      });

      return () => {
        unsubscribeText();
        unsubscribeConn();
      };
    }

    // Mode 2: Web Preview / Simulator Environment using WebSocket
    fetchSessionToken();

    const connectWebSocket = () => {
      setConnectionStatus('Connecting...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?role=companion`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus('Connected');
        };

        ws.onmessage = (event) => {
          try {
            const data: WsMessagePayload = JSON.parse(event.data);
            if (data.type === 'TEXT_UPDATE' && typeof data.text === 'string') {
              setText(data.text);
            } else if (data.type === 'SENDER_STATUS') {
              setSenderActive(!!data.connected);
            } else if (data.type === 'TOKEN_REFRESHED') {
              fetchSessionToken();
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          setConnectionStatus('Disconnected');
          setSenderActive(false);
          // Auto-reconnect
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
          console.error('Companion WebSocket error:', err);
          setConnectionStatus('Disconnected');
        };
      } catch (err) {
        console.error('WebSocket connection failure:', err);
        setConnectionStatus('Disconnected');
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [updatePreferences]);

  // Action: Copy text
  const handleCopy = async () => {
    if (!text) return;
    let success = false;
    if (window.companion?.copyText) {
      success = await window.companion.copyText(text);
    } else {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (e) {
        console.error('Copy failed:', e);
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Action: Clear text
  const handleClear = () => {
    setText('');
    if (window.companion?.clearText) {
      window.companion.clearText();
    }
    // Also notify if in web mode
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'TEXT_UPDATE', text: '' }));
    }
  };

  const handleRegenerateToken = async () => {
    if (window.companion?.regenerateSessionToken) {
      const newToken = await window.companion.regenerateSessionToken();
      setSessionToken(newToken);
    } else {
      try {
        const res = await fetch('/api/session-token/regenerate', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setSessionToken(data.token);
        }
      } catch (e) {
        console.error('Failed to regenerate token:', e);
      }
    }
  };

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isDark = preferences.theme === 'dark';

  return (
    <div
      className={`flex flex-col h-full w-full select-none transition-colors duration-200 overflow-hidden ${
        isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
      } ${!isEmbeddedWindow ? 'border border-neutral-800 rounded-lg shadow-xl' : ''}`}
    >
      {/* Title Bar / Window Header */}
      <header
        className={`flex items-center justify-between px-3 py-2 border-b select-none transition-colors ${
          isDark
            ? 'bg-neutral-900/90 border-neutral-800 text-neutral-200'
            : 'bg-neutral-100 border-neutral-200 text-neutral-800'
        }`}
      >
        {/* Left: Window identity & Status */}
        <div className="flex items-center gap-2.5">
          {/* OS Window Traffic Lights for desktop aesthetic */}
          <div className="flex items-center gap-1.5">
            <span
              onClick={onCloseSimulated || (() => window.companion?.close())}
              className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-500 cursor-pointer transition-colors shadow-xs"
              title="Close window"
            />
            <span
              onClick={() => window.companion?.minimize()}
              className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 cursor-pointer transition-colors shadow-xs"
              title="Minimize"
            />
            <span
              onClick={() => window.companion?.maximize()}
              className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 cursor-pointer transition-colors shadow-xs"
              title="Maximize"
            />
          </div>

          <div className="h-3 w-px bg-neutral-700/40 mx-0.5" />

          <h2 className="text-xs font-semibold tracking-tight">Companion</h2>

          <div className="h-3 w-px bg-neutral-700/40 mx-0.5" />

          <ConnectionStatus
            status={connectionStatus}
            senderActive={senderActive}
            theme={preferences.theme}
            onReconnect={() => {
              if (wsRef.current) wsRef.current.close();
            }}
          />
        </div>

        {/* Right: Security & Settings */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSecurityModalOpen(true)}
            className={`p-1 rounded text-neutral-400 hover:text-white transition-colors ${
              isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-200'
            }`}
            title="Session Token & Security Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main App Toolbar */}
      <Toolbar
        fontSize={preferences.fontSize}
        theme={preferences.theme}
        autoScroll={preferences.autoScroll}
        copied={copied}
        onFontSizeChange={(size) => updatePreferences({ fontSize: size })}
        onThemeToggle={() => updatePreferences({ theme: isDark ? 'light' : 'dark' })}
        onAutoScrollToggle={() => updatePreferences({ autoScroll: !preferences.autoScroll })}
        onCopy={handleCopy}
        onClear={handleClear}
        onOpenSettings={() => setIsSecurityModalOpen(true)}
        charCount={charCount}
        wordCount={wordCount}
      />

      {/* Text Viewer Content Area */}
      <TextViewer
        text={text}
        fontSize={preferences.fontSize}
        theme={preferences.theme}
        autoScroll={preferences.autoScroll}
        onClear={handleClear}
        onCopy={handleCopy}
      />

      {/* Security & Token Settings Modal */}
      <SecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        sessionToken={sessionToken}
        onRegenerateToken={handleRegenerateToken}
        theme={preferences.theme}
        port={port}
      />
    </div>
  );
};
