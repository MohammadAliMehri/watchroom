import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';
import type { RoomSummary } from '../hooks/useRoom';

interface JoinDialogProps {
  room: RoomSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onJoin: (roomId: string, password: string, userName: string) => Promise<{ success: boolean; error?: string }>;
}

export const JoinDialog: React.FC<JoinDialogProps> = ({
  room,
  isOpen,
  onClose,
  onJoin,
}) => {
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMessage(null);
      // Autofocus the password field when dialog opens (Section 12.4)
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen || !room) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await onJoin(room.id, password, userName);
      if (res.success) {
        onClose();
      } else {
        // Section 12.4 exact requirement:
        // "Wrong password shows 'Wrong password. Ask the room creator for the right one.'"
        setErrorMessage(res.error || 'Wrong password. Ask the room creator for the right one.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Wrong password. Ask the room creator for the right one.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-room-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm bg-[#14171f] border border-white/10 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Lock className="w-5 h-5" />
          </div>
          <div className="min-w-0 pr-4">
            <h3 id="join-room-title" className="text-lg font-semibold text-white truncate">
              Join {room.name}
            </h3>
            <p className="text-xs text-gray-400">
              Enter the room password to join.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* User Display Name */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Your name (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Alex"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Room password
            </label>
            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="w-full px-3.5 py-2.5 pr-10 bg-black/50 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {errorMessage && (
              <p className="text-xs text-red-400 mt-1.5">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-600/20"
            >
              {isSubmitting ? 'Joining…' : 'Join room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
