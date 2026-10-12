import React from 'react';
import { Film, Home as HomeIcon, Plus, Radio, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  currentView: 'home' | 'room';
  activeRoomName?: string;
  activeRoomId?: string;
  onNavigateHome: () => void;
  onNavigateRoom: () => void;
  onCreateRoom: () => void;
  onOpenHelp: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  activeRoomName,
  activeRoomId,
  onNavigateHome,
  onNavigateRoom,
  onCreateRoom,
  onOpenHelp,
}) => {
  return (
    <aside className="hidden md:flex flex-col justify-between w-64 shrink-0 glass-panel border-r border-white/10 p-4 h-screen sticky top-0">
      <div className="flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-bold text-white tracking-tight">
              WatchRoom
            </span>
            <span className="block text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
              v2 • Sync Player
            </span>
          </div>
        </div>

        {/* Primary Action Button */}
        <Button
          onClick={onCreateRoom}
          className="h-10 w-full bg-violet-600 px-3 text-xs font-semibold text-white shadow-md shadow-violet-600/20 hover:bg-violet-500"
        >
          <Plus className="w-4 h-4" />
          <span>New Room</span>
        </Button>

        {/* Navigation items */}
        <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
          <Button
            onClick={onNavigateHome}
            variant="ghost"
            className={`h-auto w-full justify-start px-3 py-2 text-sm font-medium ${
              currentView === 'home'
                ? 'bg-[#1f2430] text-white border border-white/5'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HomeIcon className="w-4 h-4 text-violet-400" />
            <span>Home</span>
          </Button>

          {activeRoomId && (
            <Button
              onClick={onNavigateRoom}
              variant="ghost"
              className={`h-auto w-full justify-between px-3 py-2 text-sm font-medium ${
                currentView === 'room'
                  ? 'bg-[#1f2430] text-white border border-white/5'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <Radio className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
                <span className="truncate">{activeRoomName || 'Current Room'}</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            </Button>
          )}
        </nav>
      </div>

      {/* Footer Info / Shortcuts */}
      <div className="flex flex-col gap-3 pt-4 border-t border-white/5 px-2">
        <Button
          onClick={onOpenHelp}
          variant="ghost"
          className="h-auto justify-start px-0 text-xs text-gray-400 hover:bg-transparent hover:text-white"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Keyboard shortcuts</span>
        </Button>

        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>WatchRoom v2</span>
          <span>HLS Conversion</span>
        </div>
      </div>
    </aside>
  );
};
