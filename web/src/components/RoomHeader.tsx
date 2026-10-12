import React, { useState } from 'react';
import { ArrowLeft, Copy, Check, Shield } from 'lucide-react';
import { AvatarStack } from './AvatarStack';
import type { Member } from '../hooks/useRoom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RoomHeaderProps {
  roomId: string;
  roomName: string;
  isPlaying: boolean;
  hostOnly: boolean;
  isHost: boolean;
  members: Member[];
  onLeave: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomId,
  roomName,
  isPlaying,
  hostOnly,
  isHost,
  members,
  onLeave,
}) => {
  const [copied, setCopied] = useState(false);

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
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

          {/* Live Badge (Section 12.2: bg-red-500 only for playing rooms) */}
          {isPlaying && (
            <Badge className="gap-1.5 border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-red-400 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span>Live</span>
            </Badge>
          )}

          {/* Host Mode Badge */}
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

      <div className="flex items-center gap-3">
        {/* Active Viewers Stack */}
        <AvatarStack members={members} />

        {/* Share/Copy link button */}
        <Button
          onClick={copyRoomLink}
          aria-label="Copy room invite link"
          variant="secondary"
          size="sm"
          className="border border-white/5 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
        </Button>
      </div>
    </header>
  );
};
