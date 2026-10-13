import React, { useState, useEffect } from 'react';
import { Film, Plus, Radio, Users, Play, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface RoomItem {
  id: string;
  name: string;
  ownerName: string;
  memberCount: number;
  playing: boolean;
  nowPlaying: string | null;
}

interface RoomsScreenProps {
  onCreateRoom: () => void;
  onSelectRoom: (roomId: string) => void;
}

export const RoomsScreen: React.FC<RoomsScreenProps> = ({ onCreateRoom, onSelectRoom }) => {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Dashboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">My Rooms</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Rooms you created or participate in
          </p>
        </div>
        <Button
          onClick={onCreateRoom}
          className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 h-10 shadow-lg shadow-violet-600/30"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Create Room</span>
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-[#131722]/60 border border-white/5" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        // Spec 9 requirement: Empty state: "You have no rooms yet."
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-2xl bg-[#131722]/30">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 mb-4">
            <Film className="w-6 h-6 text-violet-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">You have no rooms yet.</h3>
          <p className="text-xs text-gray-400 max-w-sm mb-6">
            Create your first room to invite friends, add movies, and watch in synchronized real-time.
          </p>
          <Button
            onClick={onCreateRoom}
            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 h-9"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Create a Room</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Card
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className="bg-[#131722]/90 border-white/10 hover:border-violet-500/50 hover:bg-[#1a2030] transition-all cursor-pointer group rounded-xl overflow-hidden shadow-xl"
            >
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">
                      #{room.id}
                    </span>
                    {room.playing ? (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 animate-pulse">
                        <Radio className="w-3 h-3 mr-1" />
                        <span>Playing</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-400 border-white/10 text-[10px] px-2 py-0.5">
                        <Clock className="w-3 h-3 mr-1" />
                        <span>Idle</span>
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-violet-300 transition-colors line-clamp-1">
                    {room.name}
                  </h3>

                  <p className="text-xs text-gray-400 line-clamp-1">
                    {room.nowPlaying ? (
                      <span className="flex items-center gap-1.5 text-gray-300">
                        <Play className="w-3 h-3 text-violet-400 shrink-0" />
                        <span>{room.nowPlaying}</span>
                      </span>
                    ) : (
                      'No media active'
                    )}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-gray-500" />
                    <span>{room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">Host: {room.ownerName}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
