import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space or K', action: 'Play / pause' },
    { key: '← / →', action: 'Seek back / forward 10 s' },
    { key: '↑ / ↓', action: 'Volume up / down' },
    { key: 'M', action: 'Mute / unmute' },
    { key: 'F', action: 'Fullscreen toggle' },
    { key: 'N', action: 'Next playlist item' },
    { key: '/', action: 'Focus the movie link field' },
    { key: 'Enter', action: 'Send chat message' },
    { key: 'Esc', action: 'Close dialog or exit fullscreen' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-[#14171f] border border-white/10 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          aria-label="Close shortcuts dialog"
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h3 id="shortcuts-title" className="text-lg font-semibold text-white">
              Keyboard shortcuts
            </h3>
            <p className="text-xs text-gray-400">
              Desktop shortcuts for instant media control
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0"
            >
              <kbd className="px-2.5 py-1 bg-black/60 border border-white/10 rounded-lg text-xs font-mono text-violet-300">
                {s.key}
              </kbd>
              <span className="text-sm text-gray-300">{s.action}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-3 border-t border-white/5 text-center">
          <p className="text-xs text-gray-500">
            Touch devices: Tap to show controls • Double-tap left/right half to seek 10 s
          </p>
        </div>
      </div>
    </div>
  );
};
