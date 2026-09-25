import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionState, AppPreferences } from '../types/companion';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Toolbar } from '../components/Toolbar';
import { TextViewer } from '../components/TextViewer';
import { SecurityModal } from '../components/SecurityModal';
import { Minus, Square, X, Settings, Shield, Sparkles, Pin, PinOff } from 'lucide-react';

// Companion window UI, rendered inside Electron (receives text and images over IPC)
export const CompanionApp: React.FC = () => {
  const [text, setText] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('Connecting...');
  const [senderActive, setSenderActive] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [port, setPort] = useState<number>(8765);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  // Reply box: text shown on the connected web sender page
  const [reply, setReply] = useState<string>('');
  const replyTimerRef = useRef<any>(null);

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

  // Receive text, images and connection status from the Electron main process
  useEffect(() => {
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

      const unsubscribeImages = window.companion.onImagesUpdate((data) => {
        setImages(data.images || []);
      });

      // Subscribe to connection status
      const unsubscribeConn = window.companion.onConnectionChange((status) => {
        setConnectionStatus(status.statusText);
        setSenderActive(status.connected);
        setPort(status.port || 8765);
        setAddresses(status.addresses || []);
        if (status.sessionToken) setSessionToken(status.sessionToken);
      });

      window.companion.getConnectionStatus().then((status) => {
        setConnectionStatus(status.statusText);
        setSenderActive(status.connected);
        setPort(status.port || 8765);
        setAddresses(status.addresses || []);
      });

      return () => {
        unsubscribeText();
        unsubscribeImages();
        unsubscribeConn();
      };
    }
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
    setImages([]);
    if (window.companion?.clearText) {
      window.companion.clearText();
    }
  };

  const handleRegenerateToken = async () => {
    if (window.companion?.regenerateSessionToken) {
      const newToken = await window.companion.regenerateSessionToken();
      setSessionToken(newToken);
    }
  };

  const updateReply = (value: string, immediate = false) => {
    setReply(value);
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    const send = () => window.companion?.sendReply(value);
    if (immediate) send();
    else replyTimerRef.current = setTimeout(send, 150);
  };

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isDark = preferences.theme === 'dark';

  return (
    <div
      className={`flex flex-col h-full w-full select-none transition-colors duration-200 overflow-hidden ${
        isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
      } border border-neutral-800 rounded-lg shadow-xl`}
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
              onClick={() => window.companion?.close()}
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
          />
        </div>

        {/* Right: Pin on top, Security & Settings */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => updatePreferences({ alwaysOnTop: !preferences.alwaysOnTop })}
            className={`p-1 rounded transition-colors ${
              preferences.alwaysOnTop ? 'text-indigo-400' : 'text-neutral-400 hover:text-white'
            } ${isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-200'}`}
            title={preferences.alwaysOnTop ? 'Unpin (stop keeping on top)' : 'Pin (keep above other windows)'}
            aria-pressed={!!preferences.alwaysOnTop}
          >
            {preferences.alwaysOnTop ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
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

      {/* Pasted images from the sender */}
      {images.length > 0 && (
        <div
          className={`flex flex-col gap-3 p-4 overflow-y-auto ${text ? 'max-h-[55%] shrink-0 border-b' : 'flex-1'} ${
            isDark ? 'border-neutral-800' : 'border-neutral-200'
          }`}
        >
          {images.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Pasted image ${index + 1}`}
              className="max-w-full h-auto rounded-md border border-neutral-800 self-start"
              draggable={false}
            />
          ))}
        </div>
      )}

      {/* Text Viewer Content Area (hidden when only images were sent, to skip the empty state) */}
      {(text || images.length === 0) && (
      <TextViewer
        text={text}
        fontSize={preferences.fontSize}
        theme={preferences.theme}
        autoScroll={preferences.autoScroll}
        onClear={handleClear}
        onCopy={handleCopy}
      />
      )}

      {/* Reply box: shown on the web sender page */}
      <div
        className={`shrink-0 border-t p-2 flex flex-col gap-1 ${
          isDark ? 'border-neutral-800 bg-neutral-900/60' : 'border-neutral-200 bg-neutral-100'
        }`}
      >
        <div className="flex items-center justify-between text-[11px] text-neutral-500 px-0.5">
          <span>Reply — shown on the web page</span>
          {reply && (
            <button onClick={() => updateReply('', true)} className="hover:text-neutral-300">
              Clear reply
            </button>
          )}
        </div>
        <textarea
          value={reply}
          onChange={(e) => updateReply(e.target.value)}
          placeholder="Type or paste a reply…"
          rows={3}
          className={`w-full resize-none rounded-md border px-2 py-1.5 text-sm select-text focus:outline-none focus:border-indigo-500 ${
            isDark ? 'bg-neutral-950 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'
          }`}
        />
      </div>

      {/* Security & Token Settings Modal */}
      <SecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        sessionToken={sessionToken}
        onRegenerateToken={handleRegenerateToken}
        theme={preferences.theme}
        port={port}
        addresses={addresses}
      />
    </div>
  );
};
