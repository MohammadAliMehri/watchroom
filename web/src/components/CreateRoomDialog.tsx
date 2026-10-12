import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Shield, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="flex-row items-center gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Film className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle id="create-room-title">
              Create a room
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Set a name and password for your room.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Room Name Field */}
          <div>
            <label htmlFor="create-room-name" className="mb-1.5 block text-xs font-medium text-gray-300">
              Room name
            </label>
            <Input
              ref={nameInputRef}
              id="create-room-name"
              type="text"
              maxLength={40}
              placeholder="e.g. Movie Night with Friends"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? 'create-room-name-error' : undefined}
              className="h-11 rounded-xl border-white/10 bg-black/50 px-3.5 py-2.5 placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
            />
            {nameError && (
              <p id="create-room-name-error" role="alert" className="mt-1 text-xs text-red-400">{nameError}</p>
            )}
          </div>

          {/* Password Field with Show/Hide toggle */}
          <div>
            <label htmlFor="create-room-password" className="mb-1.5 block text-xs font-medium text-gray-300">
              Room password
            </label>
            <div className="relative">
              <Input
                id="create-room-password"
                type={showPassword ? 'text' : 'password'}
                minLength={4}
                maxLength={100}
                placeholder="At least 4 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'create-room-password-error' : undefined}
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
            {passwordError && (
              <p id="create-room-password-error" role="alert" className="mt-1 text-xs text-red-400">{passwordError}</p>
            )}
          </div>

          {/* Host-only toggle */}
          <label htmlFor="create-room-host-only" className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/5 bg-black/30 p-3 transition-colors hover:bg-black/40">
            <Checkbox
              id="create-room-host-only"
              checked={hostOnly}
              onCheckedChange={(checked) => setHostOnly(checked === true)}
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
              disabled={isSubmitting}
              className="flex-1 bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500"
            >
              {isSubmitting ? 'Creating…' : 'Create room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
