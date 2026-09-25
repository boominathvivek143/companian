import React, { useState, useEffect } from 'react';
import { WebSender } from './sender/WebSender';
import { CompanionApp } from './companion/CompanionApp';
import { DesktopWindowSimulator } from './components/DesktopWindowSimulator';
import { PackagingGuide } from './components/PackagingGuide';
import { Monitor, Globe, SplitSquareVertical, PackageCheck, Shield, Key } from 'lucide-react';

type ViewMode = 'split' | 'sender' | 'companion' | 'packaging';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sessionToken, setSessionToken] = useState<string>('');

  // Check URL parameters for mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode') as ViewMode | null;
    const tokenParam = params.get('token');

    if (tokenParam) {
      setSessionToken(tokenParam);
    }

    if (modeParam && ['split', 'sender', 'companion', 'packaging'].includes(modeParam)) {
      setViewMode(modeParam);
    }

    // Fetch active session token from server
    fetch('/api/session-token')
      .then((res) => res.json())
      .then((data) => {
        if (data.token) {
          setSessionToken(data.token);
        }
      })
      .catch(() => {});
  }, []);

  // Update URL search param cleanly without full reload
  const handleViewChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    const url = new URL(window.location.href);
    url.searchParams.set('mode', newMode);
    window.history.pushState({}, '', url.toString());
  };

  // If running inside native Electron companion window, render companion app directly
  if (typeof window !== 'undefined' && window.companion) {
    return (
      <div className="h-screen w-screen bg-neutral-950 flex flex-col overflow-hidden">
        <CompanionApp />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans antialiased overflow-hidden">
      {/* 3-Zone Top Bar Contract */}
      <header className="h-14 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 select-none z-20">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              handleViewChange('split');
            }}
            className="text-base font-bold tracking-tight text-white flex items-center gap-2"
          >
            <span>Desktop Companion</span>
          </a>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => handleViewChange('split')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              viewMode === 'split'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Dual Live Sandbox</span>
            <span className="sm:hidden">Dual</span>
          </button>

          <button
            onClick={() => handleViewChange('sender')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              viewMode === 'sender'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Web Sender</span>
            <span className="sm:hidden">Sender</span>
          </button>

          <button
            onClick={() => handleViewChange('companion')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              viewMode === 'companion'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Companion Window</span>
            <span className="sm:hidden">Companion</span>
          </button>

          <button
            onClick={() => handleViewChange('packaging')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              viewMode === 'packaging'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Packaging & Arch</span>
            <span className="sm:hidden">Packaging</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action / Active Token Badge */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-neutral-400">
            <Key className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="text-neutral-500">Token:</span>
            <span className="text-indigo-300 truncate max-w-[100px] select-all">
              {sessionToken ? `${sessionToken.slice(0, 10)}...` : 'Generating...'}
            </span>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden relative">
        {viewMode === 'split' && (
          <div className="h-full w-full grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800">
            {/* Left: Web Sender Panel */}
            <div className="lg:col-span-6 h-full p-3 sm:p-4 flex flex-col overflow-hidden bg-neutral-950/60">
              <WebSender initialToken={sessionToken} />
            </div>

            {/* Right: Desktop Companion Window Simulator */}
            <div className="lg:col-span-6 h-full p-2 sm:p-4 flex flex-col overflow-hidden bg-neutral-900/40">
              <DesktopWindowSimulator onPopoutStandalone={() => handleViewChange('companion')} />
            </div>
          </div>
        )}

        {viewMode === 'sender' && (
          <div className="h-full w-full bg-neutral-950 p-4 sm:p-8 flex flex-col justify-center items-center overflow-y-auto">
            <div className="w-full max-w-2xl h-[580px] flex flex-col">
              <WebSender initialToken={sessionToken} isStandalone={true} />
            </div>
          </div>
        )}

        {viewMode === 'companion' && (
          <div className="h-full w-full bg-neutral-950 p-3 sm:p-6 flex flex-col items-center justify-center overflow-hidden">
            <div className="w-full max-w-[640px] h-[540px] flex flex-col rounded-xl overflow-hidden border border-neutral-800 shadow-2xl">
              <CompanionApp />
            </div>
          </div>
        )}

        {viewMode === 'packaging' && <PackagingGuide />}
      </main>
    </div>
  );
}
