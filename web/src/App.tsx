import React, { useState } from 'react';
import { Film, Plus, Radio, ShieldAlert } from 'lucide-react';
import { useRoom, type RoomSummary } from './hooks/useRoom';
import { Sidebar } from './components/Sidebar';
import { Home } from './components/Home';
import { RoomView } from './components/RoomView';
import { CreateRoomDialog } from './components/CreateRoomDialog';
import { JoinDialog } from './components/JoinDialog';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Button } from '@/components/ui/button';

export function App() {
  const roomHook = useRoom();
  const {
    rooms,
    stats,
    isLoadingRooms,
    activeRoomId,
    roomName,
    createRoom,
    joinRoom,
    lastNotice,
  } = roomHook;

  const [currentView, setCurrentView] = useState<'home' | 'room'>('home');
  const [userName, setUserName] = useState<string>('Guest');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomSummary | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Synchronize view when joining / leaving room
  React.useEffect(() => {
    if (activeRoomId) {
      setCurrentView('room');
    } else {
      setCurrentView('home');
    }
  }, [activeRoomId]);

  const handleCreateRoom = async (name: string, pass: string, hostOnly: boolean) => {
    const res = await createRoom(name, pass, hostOnly);
    if (res.success && res.room) {
      // Auto-join the newly created room
      await joinRoom(res.room.id, pass, userName);
    }
    return res;
  };

  const handleSelectRoomToJoin = (room: RoomSummary) => {
    setSelectedRoom(room);
    setIsJoinOpen(true);
  };

  const handleJoinSubmit = async (roomId: string, pass: string, name: string) => {
    if (name.trim()) {
      setUserName(name.trim());
    }
    return await joinRoom(roomId, pass, name.trim() || userName);
  };

  return (
    <div className="min-h-screen bg-[#0b0d12] text-[#f3f4f6] flex flex-col md:flex-row">
      {/* Toast Notice (e.g. host-only action block) */}
      {lastNotice && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-yellow-950/90 border border-yellow-500/40 text-yellow-200 text-xs font-medium rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <ShieldAlert className="w-4 h-4 text-yellow-400" />
          <span>{lastNotice}</span>
        </div>
      )}

      {/* Desktop & Tablet Sidebar (Hidden on mobile below md) */}
      <Sidebar
        currentView={currentView}
        activeRoomName={roomName}
        activeRoomId={activeRoomId || undefined}
        onNavigateHome={() => setCurrentView('home')}
        onNavigateRoom={() => activeRoomId && setCurrentView('room')}
        onCreateRoom={() => setIsCreateOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header (Hidden on md and up) */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-panel border-b border-white/10 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white">
              <Film className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">
              WatchRoom
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeRoomId && currentView === 'home' && (
              <Button
                onClick={() => setCurrentView('room')}
                variant="secondary"
                size="sm"
                className="bg-[#1f2430] text-violet-300 hover:bg-[#262c3b]"
              >
                <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                <span>Return</span>
              </Button>
            )}

            <Button
              onClick={() => setIsCreateOpen(true)}
              aria-label="Create new room"
              size="icon"
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {currentView === 'home' ? (
            <Home
              rooms={rooms}
              stats={stats}
              isLoading={isLoadingRooms}
              onCreateRoom={() => setIsCreateOpen(true)}
              onSelectRoom={handleSelectRoomToJoin}
            />
          ) : (
            <RoomView
              roomHook={roomHook}
              currentUserName={userName}
            />
          )}
        </main>
      </div>

      {/* Dialogs & Modals */}
      <CreateRoomDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateRoom}
      />

      <JoinDialog
        room={selectedRoom}
        isOpen={isJoinOpen}
        onClose={() => {
          setIsJoinOpen(false);
          setSelectedRoom(null);
        }}
        onJoin={handleJoinSubmit}
      />

      <ShortcutsModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}

export default App;
