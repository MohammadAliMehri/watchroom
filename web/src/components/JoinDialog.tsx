import React, { useState, useEffect, useRef } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import type { RoomSummary } from '../hooks/useRoom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader className="flex-row items-center gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Lock className="w-5 h-5" />
          </div>
          <div className="min-w-0 pr-4">
            <DialogTitle id="join-room-title" className="truncate">
              Join {room.name}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Enter the room password to join.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* User Display Name */}
          <div>
            <label htmlFor="join-room-name" className="mb-1.5 block text-xs font-medium text-gray-300">
              Your name (optional)
            </label>
            <Input
              id="join-room-name"
              type="text"
              placeholder="e.g. Alex"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="h-11 rounded-xl border-white/10 bg-black/50 px-3.5 py-2.5 placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
            />
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="join-room-password" className="mb-1.5 block text-xs font-medium text-gray-300">
              Room password
            </label>
            <div className="relative">
              <Input
                ref={passwordInputRef}
                id="join-room-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? 'join-room-password-error' : undefined}
                className="h-11 rounded-xl border-white/10 bg-black/50 px-3.5 py-2.5 pr-10 placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
              />
              <Button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-gray-400 hover:bg-transparent hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>

            {errorMessage && (
              <p id="join-room-password-error" role="alert" className="mt-1.5 text-xs text-red-400">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Actions */}
          <DialogFooter className="mt-2 sm:justify-start">
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
              className="flex-1 bg-white/5 text-gray-300 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !password}
              className="flex-1 bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500"
            >
              {isSubmitting ? 'Joining…' : 'Join room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
