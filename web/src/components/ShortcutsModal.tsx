import React from 'react';
import { Keyboard } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="flex-row items-center gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle id="shortcuts-title">
              Keyboard shortcuts
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Desktop shortcuts for instant media control
            </DialogDescription>
          </div>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
};
