import React, { useState } from 'react';
import { ArrowLeft, Copy, Check, Shield, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { AvatarStack } from './AvatarStack';
import type { Member } from '../hooks/useRoom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RoomHeaderProps {
  roomId: string;
  roomName: string;
  isPlaying: boolean;
  hostOnly: boolean;
  isHost: boolean;
  isOwner?: boolean;
  members: Member[];
  onLeave: () => void;
  onRoomRenamed?: (newName: string) => void;
  onRoomDeleted?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomId,
  roomName,
  isPlaying,
  hostOnly,
  isHost,
  isOwner,
  members,
  onLeave,
  onRoomRenamed,
  onRoomDeleted,
}) => {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState(roomName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to rename room.');
        return;
      }
      setRenameOpen(false);
      onRoomRenamed?.(newName.trim());
    } catch {
      setErrorMsg('Failed to rename room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to delete room.');
        return;
      }
      setDeleteOpen(false);
      onRoomDeleted?.();
    } catch {
      setErrorMsg('Failed to delete room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="glass-panel rounded-xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Leave Room Button */}
          <Button
            onClick={onLeave}
            aria-label="Leave room"
            variant="secondary"
            size="sm"
            className="bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex flex-col min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-white truncate">
                {roomName}
              </h2>
              <span className="text-[10px] text-gray-500 font-mono">
                ID: {roomId}
              </span>
            </div>

            {isPlaying && (
              <Badge className="gap-1.5 border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-red-400 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>Live</span>
              </Badge>
            )}

            {hostOnly && (
              <Badge
                variant="outline"
                title={isHost ? 'You are the host' : 'Only the host can control playback'}
                className="hidden border-violet-500/40 bg-violet-950/60 px-2 py-0.5 text-[11px] text-violet-300 md:flex"
              >
                <Shield className="w-3 h-3 text-violet-400" />
                <span>Host controls</span>
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Viewers Stack */}
          <AvatarStack members={members} />

          {/* Copy room ID button */}
          <Button
            onClick={copyRoomId}
            aria-label="Copy room ID"
            variant="secondary"
            size="sm"
            className="border border-white/5 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
          </Button>

          {/* Owner Menu: Rename and Delete (Spec 10) */}
          {isOwner && (
            <div className="relative">
              <Button
                onClick={() => setMenuOpen(!menuOpen)}
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-white hover:bg-white/5"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-40 rounded-xl bg-[#131722] border border-white/10 shadow-2xl z-50 p-1 animate-in fade-in zoom-in-95"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    onClick={() => {
                      setNewName(roomName);
                      setRenameOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white rounded-lg transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-violet-400" />
                    <span>Rename Room</span>
                  </button>
                  <button
                    onClick={() => {
                      setDeleteOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Delete Room</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Room</DialogTitle>
            <DialogDescription className="text-xs">
              Change the display name of your room.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new room name"
              className="bg-[#0b0d12] border-white/10 text-white"
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-violet-600 hover:bg-violet-500 text-white">
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md border-red-900/40">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Room</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete this room? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleDelete}
              variant="destructive"
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {isSubmitting ? 'Deleting…' : 'Delete Room'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
