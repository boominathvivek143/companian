# Desktop Companion Application

A real-time desktop companion application that receives text from a web page with minimal latency and displays it inside an independent, sandboxed desktop window.

```text
Web Browser (Sender)
     │
     │ WebSocket (150ms debounce)
     ▼
Local Communication Layer (ws://127.0.0.1:8765)
     │
     │ IPC (contextIsolation: true, sandbox: true)
     ▼
Desktop Companion Window (React Renderer)
```

---

## Technical Specifications & Features

- **Fast Real-Time Text Synchronization**: Debounced WebSocket transport (100–200 ms) automatically synchronizes text without manual submission.
- **Dedicated Desktop Companion Window**: 600×500 px initial window, resizable, scrollable, with dark/light themes and dynamic font scaling (12px–32px).
- **Hardened Electron Security**:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - No `require`, `process`, or `child_process` exposed to renderer.
  - Safe plain-text rendering (incoming `<script>` and HTML tags are rendered literally, not executed).
  - 5 MB maximum WebSocket message payload protection.
- **Session Token Security**: Local loopback WebSocket service (`127.0.0.1`) authenticated via cryptographically generated session tokens.
- **Single Active Sender Management**: Handles multiple browser tabs with warnings and graceful role takeover.
- **Memory-Only Data Privacy**: No permanent cloud database or disk storage of synchronized text.
- **Cross-Platform Packaging**: Ready-to-build configurations for Windows (`.exe` NSIS installer), macOS (`.dmg`), and Linux (`.AppImage`, `.deb`).

---

## Project Structure

```text
desktop-companion/
├── electron/
│   ├── main.ts              # Electron Main process, lifecycle & preferences
│   ├── preload.ts           # Secure ContextBridge IPC exposing window.companion
│   ├── websocket-server.ts  # Local 127.0.0.1:8765 WebSocket server
│   └── ipc.ts               # Typed IPC channels & preference contracts
├── src/
│   ├── companion/
│   │   └── CompanionApp.tsx # React Companion Window UI
│   ├── components/
│   │   ├── ConnectionStatus.tsx # Visual connection indicators
│   │   ├── DesktopWindowSimulator.tsx # Native frame emulation
│   │   ├── PackagingGuide.tsx   # Build commands & acceptance checklist
│   │   ├── SecurityModal.tsx    # Session token rotation & QR pairing
│   │   ├── TextViewer.tsx       # Plain text escaping & Ctrl+F search
│   │   └── Toolbar.tsx          # Font size (A−/A+), copy, clear, theme
│   ├── sender/
│   │   └── WebSender.tsx        # Browser Sender Page with dynamic char counters
│   ├── types/
│   │   └── companion.ts         # TypeScript definitions
│   ├── App.tsx                  # Main router (Dual Sandbox, Sender, Companion)
│   ├── index.css                # Tailwind CSS styling
│   └── main.tsx                 # React entry point
├── electron-builder.json        # Windows .exe, macOS, and Linux packaging configuration
├── server.ts                    # Full-stack Express + Vite + WebSocket server
├── package.json
└── tsconfig.json
```

---

## Development & Usage

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Web Application & WebSocket Server
```bash
npm run dev
```
Runs at `http://localhost:3000`.

### 3. Launch Desktop Companion in Electron
```bash
npm run dev:electron
```

### 4. Package Desktop Installers
```bash
# Package for current platform:
npm run package

# Package specifically for Windows (.exe NSIS installer):
npm run package:win

# Package for macOS (.dmg):
npm run package:mac

# Package for Linux (.AppImage):
npm run package:linux
```

---

## Keyboard Shortcuts in Companion Window

| Shortcut | Action |
|---|---|
| `Ctrl / Cmd + C` | Copy displayed text to system clipboard |
| `Ctrl / Cmd + L` | Clear text in companion window |
| `Ctrl / Cmd + F` | Search & highlight within received text |
| `Ctrl / Cmd + A` | Select all text |
