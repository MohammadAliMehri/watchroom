import React, { useState, useEffect } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface JoinByIdDialogProps {
  initialRoomId?: string;
  isOpen: boolean;
  onClose: () => void;
  onJoin: (
    roomId: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_ERROR = "Could not join. Check the room ID and password.";

export const JoinByIdDialog: React.FC<JoinByIdDialogProps> = ({
  isOpen,
  onClose,
  onJoin,
  initialRoomId = "",
}) => {
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRoomId(initialRoomId);
      setPassword("");
      setShowPassword(false);
      setErrorMessage(null);
    }
  }, [isOpen, initialRoomId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = roomId.trim();
    if (!id || !password) return;

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await onJoin(id, password);
      if (res.success) {
        onClose();
      } else {
        setErrorMessage(res.error || DEFAULT_ERROR);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || DEFAULT_ERROR);
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
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0 pr-4">
            <DialogTitle>Join a room</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Enter the room ID and password shared by the host.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          autoComplete="off"
        >
          <div>
            <label
              htmlFor="join-by-id-room-id"
              className="mb-1.5 block text-xs font-medium text-gray-300"
            >
              Room ID
            </label>
            <Input
              id="join-by-id-room-id"
              type="text"
              placeholder="Enter room ID"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              autoFocus
              aria-invalid={Boolean(errorMessage)}
              className="h-11 rounded-xl border-white/10 bg-black/50 px-3.5 py-2.5 font-mono placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
            />
          </div>

          <div>
            <label
              htmlFor="join-by-id-password"
              className="mb-1.5 block text-xs font-medium text-gray-300"
            >
              Room password
            </label>
            <div className="relative">
              <Input
                id="join-by-id-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? "join-by-id-error" : undefined}
                className="h-11 rounded-xl border-white/10 bg-black/50 px-3.5 py-2.5 pr-10 placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
              />
              <Button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-gray-400 hover:bg-transparent hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>

            {errorMessage && (
              <p
                id="join-by-id-error"
                role="alert"
                className="mt-1.5 text-xs text-red-400"
              >
                {errorMessage}
              </p>
            )}
          </div>

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
              disabled={isSubmitting || !roomId.trim() || !password}
              className="flex-1 bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500"
            >
              {isSubmitting ? "Joining…" : "Join room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
