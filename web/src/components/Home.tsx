import React, { useState } from 'react';
import { Plus, Search, Radio, Users, Film, Tv, Sparkles, Lock } from 'lucide-react';
import type { RoomSummary, Stats } from '../hooks/useRoom';
import { getGradientPoster } from '../utils/gradientPoster';

interface HomeProps {
  rooms: RoomSummary[];
  stats: Stats;
  isLoading: boolean;
  onCreateRoom: () => void;
  onSelectRoom: (room: RoomSummary) => void;
}

export const Home: React.FC<HomeProps> = ({
  rooms,
  stats,
  isLoading,
  onCreateRoom,
  onSelectRoom,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Hero Section (rounded-3xl, tight tracking 30-48px semibold) */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#14171f]/80 to-[#0b0d12]/90 p-8 sm:p-12 shadow-xl">
        <div className="relative z-10 flex flex-col items-start gap-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>WatchRoom v2 • MKV & Direct Playback</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-semibold text-white tracking-tight leading-tight">
            Watch together in perfect sync.
          </h1>

          <p className="text-base sm:text-lg text-gray-300 font-normal leading-relaxed">
            Create a private room, invite friends, and stream any video link — including MKV, AVI, MOV, TS, WebM, and MP4 — with seamless server HLS conversion.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onCreateRoom}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create room</span>
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-violet-600/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-20 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
      </section>

      {/* Live Stats Row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white tabular-nums">
              {stats.liveRooms}
            </span>
            <p className="text-xs text-gray-400">Live streaming rooms</p>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white tabular-nums">
              {stats.viewers}
            </span>
            <p className="text-xs text-gray-400">Active viewers</p>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white tabular-nums">
              {stats.totalRooms}
            </span>
            <p className="text-xs text-gray-400">Total rooms</p>
          </div>
        </div>
      </section>

      {/* Room Listing Header & Search */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white tracking-tight">
            Available rooms
          </h2>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search rooms"
              className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Room Grid or States */}
        {isLoading ? (
          /* Skeletons while loading (Section 12.8) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="glass-panel rounded-xl p-4 h-48 animate-pulse flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-32 h-5 bg-white/10 rounded" />
                  <div className="w-12 h-5 bg-white/10 rounded-full" />
                </div>
                <div className="w-full h-16 bg-white/5 rounded-lg" />
                <div className="flex justify-between">
                  <div className="w-20 h-4 bg-white/10 rounded" />
                  <div className="w-16 h-4 bg-white/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          /* Empty state (Section 12.4) */
          <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400">
              <Film className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                No rooms yet. Create the first one.
              </h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm">
                Get started by creating a private room and sharing the password with friends.
              </p>
            </div>
            <button
              onClick={onCreateRoom}
              className="mt-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-violet-600/20 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create room</span>
            </button>
          </div>
        ) : filteredRooms.length === 0 ? (
          /* Search empty state (Section 12.4) */
          <div className="glass-panel rounded-2xl p-10 text-center flex flex-col items-center gap-2 text-gray-400">
            <Search className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-sm">No rooms match &lsquo;{searchTerm}&rsquo;.</p>
          </div>
        ) : (
          /* Room Cards Grid (rounded-xl cards, shadow on hover) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => {
              const poster = getGradientPoster(room.currentTitle || room.name);
              return (
                <div
                  key={room.id}
                  onClick={() => onSelectRoom(room)}
                  className="glass-panel rounded-xl overflow-hidden p-4 flex flex-col justify-between gap-4 cursor-pointer border border-white/10 transition-all duration-150 hover:border-violet-500/40 hover:shadow-xl hover:shadow-violet-950/20 hover:-translate-y-0.5 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-white group-hover:text-violet-300 transition-colors truncate">
                      {room.name}
                    </h3>
                    {room.isLive ? (
                      <span className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold tracking-wider uppercase">
                        Live
                      </span>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 text-[11px] text-gray-500">
                        <Lock className="w-3 h-3" />
                        <span>Private</span>
                      </span>
                    )}
                  </div>

                  {/* Gradient Preview Thumbnail */}
                  <div
                    className="w-full h-24 rounded-lg flex items-center justify-center p-3 text-center border border-white/5 relative overflow-hidden"
                    style={{ background: poster }}
                  >
                    <p className="text-xs font-medium text-white/90 line-clamp-2 drop-shadow">
                      {room.currentTitle || 'Ready for playback'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-white/5">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      <span className="tabular-nums">
                        {room.viewerCount} {room.viewerCount === 1 ? 'viewer' : 'viewers'}
                      </span>
                    </span>

                    <span className="text-violet-400 text-xs font-medium group-hover:underline">
                      Join room &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
