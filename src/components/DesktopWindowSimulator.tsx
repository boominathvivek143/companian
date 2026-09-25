import React, { useState } from 'react';
import { CompanionApp } from '../companion/CompanionApp';
import { Maximize2, Minimize2, ExternalLink, RefreshCw } from 'lucide-react';

interface DesktopWindowSimulatorProps {
  onPopoutStandalone?: () => void;
}

export const DesktopWindowSimulator: React.FC<DesktopWindowSimulatorProps> = ({
  onPopoutStandalone,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowKey, setWindowKey] = useState(0);

  const handleRestartWindow = () => {
    setWindowKey((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Simulation Info Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 text-[11px] text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-200">Electron Companion Window</span>
          <span className="text-neutral-500 font-mono text-[10px]">600 × 500 px (Native Specs)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestartWindow}
            className="flex items-center gap-1 hover:text-white transition-colors"
            title="Reload Desktop Window"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reload</span>
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="flex items-center gap-1 hover:text-white transition-colors"
            title={isMaximized ? 'Restore initial window size' : 'Expand window'}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span>{isMaximized ? 'Restore' : 'Expand'}</span>
          </button>
          {onPopoutStandalone && (
            <button
              onClick={onPopoutStandalone}
              className="flex items-center gap-1 hover:text-indigo-400 transition-colors"
              title="Open full dedicated window view"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Dedicated</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Window Frame Container */}
      <div
        className={`flex-1 p-2 sm:p-4 flex items-center justify-center bg-neutral-950/40 overflow-hidden transition-all`}
      >
        <div
          className={`w-full h-full rounded-xl overflow-hidden border border-neutral-800 shadow-2xl transition-all flex flex-col ${
            isMaximized ? 'max-w-none max-h-none' : 'max-w-[700px] max-h-[620px]'
          }`}
        >
          <CompanionApp key={windowKey} isEmbeddedWindow={true} />
        </div>
      </div>
    </div>
  );
};
