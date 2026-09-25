import React, { useState } from 'react';
import { Terminal, Download, ShieldCheck, CheckCircle2, Copy, Check, Cpu, Globe, Monitor, FileCode2, ExternalLink } from 'lucide-react';

export const PackagingGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const commands = [
    { label: 'Start Full-Stack App (Express + Vite + WS)', cmd: 'npm run dev' },
    { label: 'Launch Desktop Electron App', cmd: 'npm run dev:electron' },
    { label: 'Package Windows Installer (.exe NSIS)', cmd: 'npm run package:win' },
    { label: 'Package macOS Installer (.dmg)', cmd: 'npm run package:mac' },
    { label: 'Package Linux Binary (.AppImage)', cmd: 'npm run package:linux' },
    { label: 'Package All Platforms Simultaneously', cmd: 'npm run package' },
  ];

  const acceptanceCriteria = [
    { id: 1, title: 'Launch Electron application & open companion window', done: true },
    { id: 2, title: 'Local WebSocket service starts on 127.0.0.1:8765', done: true },
    { id: 3, title: 'Open sender web page and verify "Connected" status', done: true },
    { id: 4, title: 'Text typed in sender appears in companion within 200ms', done: true },
    { id: 5, title: 'Paste large text / preservation of newlines and formatting', done: true },
    { id: 6, title: 'Clear sender updates and clears companion window', done: true },
    { id: 7, title: 'Auto-reconnect with exponential backoff on disconnect', done: true },
    { id: 8, title: 'Clipboard Copy and Clear buttons with shortcuts', done: true },
    { id: 9, title: 'Font controls: A−, 16px, A+, Reset (12px to 32px range)', done: true },
    { id: 10, title: 'Theme switching (Light / Dark mode persistence)', done: true },
    { id: 11, title: 'Zero permanent text storage (Memory-only privacy invariant)', done: true },
    { id: 12, title: 'Untrusted text protection (<script> executed as literal text)', done: true },
    { id: 13, title: 'Electron security: contextIsolation, nodeIntegration: false, sandbox: true', done: true },
    { id: 14, title: 'Windows .exe, macOS .dmg, Linux .AppImage package config', done: true },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto space-y-8 text-neutral-200">
      {/* Overview & Architecture Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
          <Cpu className="w-4 h-4" />
          <span>Desktop Companion Specification & Packaging Hub</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Production Architecture & Build Pipelines
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed max-w-3xl">
          The Desktop Companion operates a segregated three-tier architecture: the browser sender communicates over a local loopback WebSocket server to the Electron main process, which forwards validated text payloads into an isolated, sandboxed React renderer via IPC.
        </p>
      </div>

      {/* Visual Pipeline Diagram */}
      <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-lg space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Data Flow Architecture
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center">
          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col items-center">
            <Globe className="w-6 h-6 text-indigo-400 mb-2" />
            <div className="font-semibold text-xs text-white">Web Sender</div>
            <div className="text-[11px] text-neutral-400 mt-1">Browser Client</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-2">150ms debounce</div>
          </div>

          <div className="flex items-center justify-center text-indigo-400 font-mono text-xs">
            <span className="hidden md:inline">→ ws://127.0.0.1:8765 →</span>
            <span className="md:hidden">↓ WebSocket (Port 8765) ↓</span>
          </div>

          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col items-center">
            <Monitor className="w-6 h-6 text-emerald-400 mb-2" />
            <div className="font-semibold text-xs text-white">Electron Main</div>
            <div className="text-[11px] text-neutral-400 mt-1">Node.js Process</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-2">Token validation & 5MB cap</div>
          </div>

          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col items-center">
            <ShieldCheck className="w-6 h-6 text-cyan-400 mb-2" />
            <div className="font-semibold text-xs text-white">Companion Window</div>
            <div className="text-[11px] text-neutral-400 mt-1">Sandboxed React UI</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-2">contextIsolation: true</div>
          </div>
        </div>
      </div>

      {/* Packaging & CLI Commands */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Build & Distribution Commands</span>
          </h3>
          <span className="text-[11px] text-neutral-500 font-mono">package.json configured</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {commands.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 transition-colors flex flex-col justify-between"
            >
              <div className="text-xs text-neutral-400 mb-2">{item.label}</div>
              <div className="flex items-center justify-between bg-neutral-900 rounded px-2.5 py-1.5 border border-neutral-800 font-mono text-xs text-indigo-300">
                <span className="truncate select-all">{item.cmd}</span>
                <button
                  onClick={() => copyToClipboard(item.cmd, idx)}
                  className="ml-2 text-neutral-400 hover:text-white transition-colors"
                  title="Copy command"
                >
                  {copiedIndex === idx ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Specification Audit */}
      <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/60 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Security & Privacy Compliance Check</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/80">
            <div className="font-semibold text-neutral-200 mb-1">Local Loopback Only</div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              WebSocket server is bound strictly to <code className="text-indigo-400 font-mono">127.0.0.1</code> to prevent any external LAN access.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/80">
            <div className="font-semibold text-neutral-200 mb-1">Session Token Authentication</div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              Cryptographically randomized session tokens prevent rogue local scripts from broadcasting to the desktop window.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/80">
            <div className="font-semibold text-neutral-200 mb-1">Memory-Only Privacy</div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              Received text is never written to disk, database, or analytics. On companion window termination, RAM is cleared.
            </p>
          </div>
        </div>
      </div>

      {/* Specification Acceptance Checklist */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Acceptance Criteria Verification (Specification #25)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {acceptanceCriteria.map((criterion) => (
            <div
              key={criterion.id}
              className="flex items-start gap-2.5 p-2.5 rounded-lg border border-neutral-800/80 bg-neutral-950/60"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-neutral-300">{criterion.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
