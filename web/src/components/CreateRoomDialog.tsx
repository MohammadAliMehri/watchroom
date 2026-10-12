import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, Shield, Film } from 'lucide-react';

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, password: string, hostOnly: boolean) => Promise<{ success: boolean; room?: any; error?: string }>;
}

export const CreateRoomDialog: React.FC<CreateRoomDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [hostOnly, setHostOnly] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPassword('');
      setHostOnly(false);
      setNameError(null);
      setPasswordError(null);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!name.trim()) {
      setNameError('Room name is required.');
      hasError = true;
    } else if (name.trim().length > 40) {
      setNameError('Room name must be under 40 characters.');
      hasError = true;
    } else {
      setNameError(null);
    }

    if (!password) {
      setPasswordError('Password needs at least 4 characters.');
      hasError = true;
    } else if (password.length < 4) {
      setPasswordError('Password needs at least 4 characters.');
      hasError = true;
    } else if (password.length > 100) {
      setPasswordError('Password cannot exceed 100 characters.');
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      const res = await onCreate(name.trim(), password, hostOnly);
      if (res.success) {
        onClose();
      } else {
        setPasswordError(res.error || 'Failed to create room.');
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-[#14171f] border border-white/10 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h3 id="create-room-title" className="text-lg font-semibold text-white">
              Create a room
            </h3>
            <p className="text-xs text-gray-400">
              Set a name and password for your room.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Room Name Field */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Room name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              maxLength={40}
              placeholder="e.g. Movie Night with Friends"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            {nameError && (
              <p className="text-xs text-red-400 mt-1">{nameError}</p>
            )}
          </div>

          {/* Password Field with Show/Hide toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Room password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                minLength={4}
                maxLength={100}
                placeholder="At least 4 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
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
            {passwordError && (
              <p className="text-xs text-red-400 mt-1">{passwordError}</p>
            )}
          </div>

          {/* Host-only toggle */}
          <label className="flex items-center gap-3 p-3 bg-black/30 border border-white/5 rounded-xl cursor-pointer hover:bg-black/40 transition-colors">
            <input
              type="checkbox"
              checked={hostOnly}
              onChange={(e) => setHostOnly(e.target.checked)}
              className="w-4 h-4 rounded text-violet-600 bg-black/50 border-white/20 focus:ring-violet-500"
            />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-200 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-violet-400" />
                Host-only control mode
              </span>
              <span className="text-[11px] text-gray-400">
                Only you will be able to play, pause, seek, or change media.
              </span>
            </div>
          </label>

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
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-600/20"
            >
              {isSubmitting ? 'Creating…' : 'Create room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
