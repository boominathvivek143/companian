import React, { useState, useEffect, useRef } from 'react';

type LinkStatus = 'setup' | 'connecting' | 'connected' | 'rejected';

const ADDRESS_KEY = 'companion.desktopAddress';
const TOKEN_KEY = 'companion.desktopToken';
const DEFAULT_ADDRESS = '127.0.0.1:8765';

// The desktop app accepts messages up to 5 MB, so images are shrunk and the total is capped
const MAX_IMAGES = 10;
const MAX_IMAGE_SIDE = 1920;
const MAX_TOTAL_IMAGE_CHARS = 4_500_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Downscale large images (and re-encode as JPEG) so they fit comfortably in one message
async function prepareImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  if (original.length < 1_000_000) return original;

  const img = new Image();
  img.src = original;
  await img.decode();
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const STATUS_TEXT: Record<LinkStatus, string> = {
  setup: 'Enter the address and token shown in the desktop app',
  connecting: 'Looking for desktop app…',
  connected: 'Connected to desktop app',
  rejected: 'Token rejected — check the token in the desktop app',
};

// URL parameter wins (pairing links), then the value saved in this browser, then the default
function readSetting(param: string, storageKey: string, fallback: string): string {
  const fromUrl = new URLSearchParams(window.location.search).get(param);
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(storageKey) ?? fallback;
  } catch {
    return fallback;
  }
}

// Minimal sender: types straight into the Electron desktop companion over ws://<address>
export const SimpleSender: React.FC = () => {
  const [text, setText] = useState('');
  const [address, setAddress] = useState(() => readSetting('desktop', ADDRESS_KEY, DEFAULT_ADDRESS));
  const [token, setToken] = useState(() => readSetting('desktopToken', TOKEN_KEY, ''));
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const [showSettings, setShowSettings] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  // Reply typed in the desktop app's reply box
  const [reply, setReply] = useState('');
  const [replyCopied, setReplyCopied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const authedRef = useRef(false);
  const activeRef = useRef(false);
  const textRef = useRef('');
  const imagesRef = useRef<string[]>([]);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    try {
      localStorage.setItem(ADDRESS_KEY, address);
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage unavailable (private mode): settings last for this page only
    }
  }, [address, token]);

  // Returns an open, authenticated socket that is the active sender (claiming the role if needed)
  const activeSocket = (): WebSocket | null => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return null;
    // The tab being typed in takes over from any other sender tab
    if (!activeRef.current) {
      ws.send(JSON.stringify({ type: 'CLAIM_ACTIVE_SENDER' }));
      activeRef.current = true;
    }
    return ws;
  };

  const sendText = (value: string) => {
    activeSocket()?.send(JSON.stringify({ type: 'TEXT_UPDATE', text: value, timestamp: Date.now() }));
  };

  const sendImages = (list: string[]) => {
    activeSocket()?.send(JSON.stringify({ type: 'IMAGES_UPDATE', images: list }));
  };

  // Connect to the desktop app, retrying every 3 seconds while it is unreachable
  useEffect(() => {
    const host = address.trim().replace(/^wss?:\/\//, '').replace(/\/+$/, '');
    const key = token.trim();
    if (!host || !key) {
      setStatus('setup');
      return;
    }

    let disposed = false;
    let retryTimer: any = null;

    const connect = () => {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`ws://${host}/?role=sender`);
      } catch {
        setStatus('setup');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'AUTH', token: key }));

      ws.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === 'AUTH_SUCCESS') {
          authedRef.current = true;
          setStatus('connected');
        } else if (data.type === 'AUTH_FAILED') {
          authedRef.current = false;
          setStatus('rejected');
        } else if (data.type === 'SENDER_ASSIGNED') {
          activeRef.current = true;
          // Catch the desktop window up with whatever is already typed
          if (textRef.current) sendText(textRef.current);
          if (imagesRef.current.length) sendImages(imagesRef.current);
        } else if (data.type === 'WARNING_MULTIPLE_SENDERS') {
          activeRef.current = false;
        } else if (data.type === 'REPLY_UPDATE') {
          setReply(typeof data.text === 'string' ? data.text : '');
        }
      };

      ws.onclose = () => {
        authedRef.current = false;
        activeRef.current = false;
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setStatus((prev) => (prev === 'rejected' ? prev : 'connecting'));
        retryTimer = setTimeout(connect, 3000);
      };

      // Expected while the desktop app is not running; onclose schedules the retry
      ws.onerror = () => {};
    };

    setStatus('connecting');
    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [address, token]);

  const update = (value: string, immediate = false) => {
    setText(value);
    textRef.current = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) sendText(value);
    else debounceRef.current = setTimeout(() => sendText(value), 150);
  };

  const updateImages = (list: string[]) => {
    setImages(list);
    imagesRef.current = list;
    sendImages(list);
  };

  const addImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type));
    if (imageFiles.length === 0) return;
    setImageError(null);
    try {
      const prepared = await Promise.all(imageFiles.map(prepareImage));
      const next = [...imagesRef.current, ...prepared].slice(0, MAX_IMAGES);
      const total = next.reduce((sum, img) => sum + img.length, 0);
      if (total > MAX_TOTAL_IMAGE_CHARS) {
        setImageError('Images are too large to send together. Remove one and try again.');
        return;
      }
      updateImages(next);
    } catch {
      setImageError('Could not read that image.');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault();
      addImageFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      e.preventDefault();
      addImageFiles(files);
    }
  };

  const clearAll = () => {
    update('', true);
    updateImages([]);
    setImageError(null);
  };

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(reply);
      setReplyCopied(true);
      setTimeout(() => setReplyCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the reply text can still be selected manually
    }
  };

  const connected = status === 'connected';
  const settingsOpen = showSettings || !connected;

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans antialiased">
      <div className="w-full max-w-3xl mx-auto flex flex-col flex-1 min-h-0 p-4 sm:p-6 gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400' : status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'
              }`}
            />
            <span className={connected ? 'text-emerald-400' : status === 'rejected' ? 'text-red-400' : 'text-neutral-400'}>
              {STATUS_TEXT[status]}
            </span>
          </div>
          {connected && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              {showSettings ? 'Hide settings' : 'Settings'}
            </button>
          )}
        </div>

        {settingsOpen && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="192.168.1.20:8765"
              aria-label="Desktop app address"
              className="sm:w-48 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-900 font-mono text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token from the desktop app"
              aria-label="Desktop app token"
              className="flex-1 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-900 font-mono text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((src, index) => (
              <div key={index} className="relative">
                <img
                  src={src}
                  alt={`Pasted image ${index + 1}`}
                  className="h-20 w-auto rounded-md border border-neutral-800 object-cover"
                />
                <button
                  onClick={() => updateImages(images.filter((_, i) => i !== index))}
                  aria-label={`Remove image ${index + 1}`}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs leading-none hover:bg-red-500 hover:text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {imageError && <div className="text-xs text-red-400">{imageError}</div>}

        <textarea
          value={text}
          onChange={(e) => update(e.target.value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          placeholder="Type or paste text or images here…"
          autoFocus
          className="flex-1 min-h-0 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-base leading-relaxed focus:outline-none focus:border-indigo-500"
        />

        {reply && (
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/5 p-3 flex flex-col gap-1.5 max-h-[35%] min-h-0">
            <div className="flex items-center justify-between text-xs">
              <span className="text-indigo-300 font-medium">From desktop app</span>
              <button onClick={copyReply} className="text-neutral-400 hover:text-neutral-200">
                {replyCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="overflow-y-auto whitespace-pre-wrap break-words text-sm text-neutral-200 select-text">{reply}</div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {text.length} characters{images.length > 0 && ` · ${images.length} image${images.length > 1 ? 's' : ''}`}
          </span>
          <button
            onClick={clearAll}
            className="px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-900 text-neutral-300"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};
