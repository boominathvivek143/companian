import React from 'react';
import { Copy, Check, Trash2, Sun, Moon, RotateCcw, ZoomIn, ZoomOut, ShieldCheck, ArrowDown } from 'lucide-react';
import { AppPreferences } from '../types/companion';

interface ToolbarProps {
  fontSize: number;
  theme: 'light' | 'dark';
  autoScroll: boolean;
  copied: boolean;
  onFontSizeChange: (size: number) => void;
  onThemeToggle: () => void;
  onAutoScrollToggle: () => void;
  onCopy: () => void;
  onClear: () => void;
  onOpenSettings?: () => void;
  charCount: number;
  wordCount: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  fontSize,
  theme,
  autoScroll,
  copied,
  onFontSizeChange,
  onThemeToggle,
  onAutoScrollToggle,
  onCopy,
  onClear,
  onOpenSettings,
  charCount,
  wordCount,
}) => {
  const isDark = theme === 'dark';

  const decreaseFontSize = () => {
    onFontSizeChange(Math.max(12, fontSize - 2));
  };

  const increaseFontSize = () => {
    onFontSizeChange(Math.min(32, fontSize + 2));
  };

  const resetFontSize = () => {
    onFontSizeChange(16);
  };

  const btnBase = `flex items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors transition-transform active:scale-95`;
  const btnStyle = isDark
    ? 'bg-neutral-900/90 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-800/80 shadow-xs'
    : 'bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 border border-neutral-200/90 shadow-xs';

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b select-none transition-colors ${
        isDark ? 'bg-neutral-950/80 border-neutral-800/80' : 'bg-neutral-50/90 border-neutral-200'
      }`}
    >
      {/* Left: Font controls & Word count */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className={`flex items-center rounded border overflow-hidden ${isDark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white'}`}>
          <button
            onClick={decreaseFontSize}
            disabled={fontSize <= 12}
            className={`px-2 py-1 text-xs font-semibold disabled:opacity-40 transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
            title="Decrease font size (min 12px)"
          >
            A−
          </button>
          <span
            className={`px-2 py-1 text-[11px] font-mono tabular-nums border-x ${
              isDark ? 'border-neutral-800 text-neutral-400' : 'border-neutral-200 text-neutral-600'
            }`}
          >
            {fontSize}px
          </span>
          <button
            onClick={increaseFontSize}
            disabled={fontSize >= 32}
            className={`px-2 py-1 text-xs font-semibold disabled:opacity-40 transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
            title="Increase font size (max 32px)"
          >
            A+
          </button>
          {fontSize !== 16 && (
            <button
              onClick={resetFontSize}
              className={`px-1.5 py-1 text-[10px] font-medium border-l border-dashed transition-colors ${
                isDark ? 'border-neutral-800 text-neutral-400 hover:text-white' : 'border-neutral-200 text-neutral-500 hover:text-neutral-900'
              }`}
              title="Reset font size to 16px"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Auto-scroll indicator */}
        <button
          onClick={onAutoScrollToggle}
          className={`${btnBase} ${btnStyle} ${autoScroll ? (isDark ? 'text-indigo-400 border-indigo-900/50' : 'text-indigo-600 border-indigo-200') : 'opacity-60'}`}
          title={autoScroll ? 'Auto-scroll on update enabled' : 'Auto-scroll disabled'}
        >
          <ArrowDown className={`w-3 h-3 mr-1 ${autoScroll ? 'animate-bounce' : ''}`} />
          <span className="text-[11px]">Follow</span>
        </button>

        {/* Text metrics */}
        <div className={`hidden sm:flex items-center gap-1.5 text-[11px] tabular-nums pl-1 ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
          <span>{charCount.toLocaleString()} chars</span>
          <span>·</span>
          <span>{wordCount.toLocaleString()} words</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Copy Button */}
        <button
          onClick={onCopy}
          disabled={charCount === 0}
          className={`${btnBase} ${btnStyle} disabled:opacity-40 min-w-[70px]`}
          title="Copy content to system clipboard (Ctrl+C)"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
              <span className="text-emerald-500 font-semibold text-[11px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>

        {/* Clear Button */}
        <button
          onClick={onClear}
          disabled={charCount === 0}
          className={`${btnBase} ${btnStyle} disabled:opacity-40 hover:text-rose-400 hover:border-rose-900/50`}
          title="Clear text (Ctrl+L)"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          <span className="text-[11px]">Clear</span>
        </button>

        {/* Theme Switcher */}
        <button
          onClick={onThemeToggle}
          className={`${btnBase} ${btnStyle} p-1.5`}
          title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-neutral-700" />}
        </button>

        {/* Security / Token dialog trigger */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className={`${btnBase} ${btnStyle} p-1.5`}
            title="Connection & Security Token Settings"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          </button>
        )}
      </div>
    </div>
  );
};
