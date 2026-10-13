import { useState, useEffect } from 'react';
import { Film, Plus, Radio, ShieldAlert, LogOut, User as UserIcon, List } from 'lucide-react';
import { useRoom, type RoomSummary } from './hooks/useRoom';
import { useAuth } from './hooks/useAuth';
import { Home } from './components/Home';
import { RoomView } from './components/RoomView';
import { RoomsScreen } from './components/RoomsScreen';
import { AccountScreen } from './components/AccountScreen';
import { LoginScreen } from './components/LoginScreen';
import { SignupScreen } from './components/SignupScreen';
import { CreateRoomDialog } from './components/CreateRoomDialog';
import { JoinDialog } from './components/JoinDialog';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Button } from '@/components/ui/button';

export function App() {
  const { user, loading: authLoading, logout } = useAuth();
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

  // View state: 'home' | 'rooms' | 'room' | 'account' | 'login' | 'signup'
  const [currentView, setCurrentView] = useState<'home' | 'rooms' | 'room' | 'account' | 'login' | 'signup'>('rooms');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomSummary | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Synchronize view when joining / leaving room
  useEffect(() => {
    if (activeRoomId) {
      setCurrentView('room');
    } else if (currentView === 'room') {
      setCurrentView('rooms');
    }
  }, [activeRoomId]);

  // Loading skeleton on app load while /api/auth/me resolves
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0d12] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 animate-pulse flex items-center justify-center text-white shadow-xl shadow-violet-600/30">
            <Film className="w-6 h-6 animate-spin" />
          </div>
          <div className="h-2 w-28 bg-white/10 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  // Protected route redirects unauthenticated users to /login or /signup
  if (!user) {
    if (currentView === 'signup') {
      return (
        <SignupScreen
          onNavigateToLogin={() => setCurrentView('login')}
          onSuccess={() => setCurrentView('rooms')}
        />
      );
    }
    return (
      <LoginScreen
        onNavigateToSignup={() => setCurrentView('signup')}
        onSuccess={() => setCurrentView('rooms')}
      />
    );
  }

  const handleCreateRoom = async (name: string, pass: string, hostOnly: boolean) => {
    const res = await createRoom(name, pass, hostOnly);
    if (res.success && res.room) {
      await joinRoom(res.room.id, pass);
    }
    return res;
  };

  const handleSelectRoomToJoin = (room: RoomSummary) => {
    setSelectedRoom(room);
    setIsJoinOpen(true);
  };

  const handleJoinSubmit = async (roomId: string, pass: string) => {
    return await joinRoom(roomId, pass);
  };

  return (
    <div className="min-h-screen bg-[#0b0d12] text-[#f3f4f6] flex flex-col md:flex-row">
      {/* Toast Notice */}
      {lastNotice && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-yellow-950/90 border border-yellow-500/40 text-yellow-200 text-xs font-medium rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <ShieldAlert className="w-4 h-4 text-yellow-400" />
          <span>{lastNotice}</span>
        </div>
      )}

      {/* Desktop & Tablet Sidebar */}
      <aside className="hidden md:flex flex-col justify-between w-64 shrink-0 glass-panel border-r border-white/10 p-4 h-screen sticky top-0">
        <div className="flex flex-col gap-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-2 pt-2 cursor-pointer" onClick={() => setCurrentView('rooms')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">
                WatchRoom
              </span>
              <span className="block text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                v3 • Sync Player
              </span>
            </div>
          </div>

          {/* Primary Action Button */}
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="h-10 w-full bg-violet-600 px-3 text-xs font-semibold text-white shadow-md shadow-violet-600/20 hover:bg-violet-500"
          >
            <Plus className="w-4 h-4" />
            <span>New Room</span>
          </Button>

          {/* Navigation items */}
          <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
            <Button
              onClick={() => setCurrentView('rooms')}
              variant="ghost"
              className={`h-auto w-full justify-start px-3 py-2 text-sm font-medium ${
                currentView === 'rooms'
                  ? 'bg-[#1f2430] text-white border border-white/5'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <List className="w-4 h-4 text-violet-400" />
              <span>My Rooms</span>
            </Button>

            {activeRoomId && (
              <Button
                onClick={() => setCurrentView('room')}
                variant="ghost"
                className={`h-auto w-full justify-between px-3 py-2 text-sm font-medium ${
                  currentView === 'room'
                    ? 'bg-[#1f2430] text-white border border-white/5'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <Radio className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
                  <span className="truncate">{roomName || 'Current Room'}</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              </Button>
            )}

            <Button
              onClick={() => setCurrentView('account')}
              variant="ghost"
              className={`h-auto w-full justify-start px-3 py-2 text-sm font-medium ${
                currentView === 'account'
                  ? 'bg-[#1f2430] text-white border border-white/5'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UserIcon className="w-4 h-4 text-violet-400" />
              <span>Account</span>
            </Button>
          </nav>
        </div>

        {/* User profile footer */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.displayName}</p>
              <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button
            onClick={() => logout()}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-red-400 hover:bg-red-950/20"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-panel border-b border-white/10 sticky top-0 z-40">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('rooms')}>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white">
              <Film className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">WatchRoom</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentView('account')}
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white"
            >
              <UserIcon className="w-4 h-4" />
            </Button>

            {activeRoomId && currentView !== 'room' && (
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
          {currentView === 'rooms' && (
            <RoomsScreen
              onCreateRoom={() => setIsCreateOpen(true)}
              onSelectRoom={async (id) => {
                await joinRoom(id);
              }}
            />
          )}

          {currentView === 'account' && <AccountScreen />}

          {currentView === 'room' && (
            <RoomView
              roomHook={roomHook}
              currentUserName={user.displayName}
            />
          )}

          {currentView === 'home' && (
            <Home
              rooms={rooms}
              stats={stats}
              isLoading={isLoadingRooms}
              onCreateRoom={() => setIsCreateOpen(true)}
              onSelectRoom={handleSelectRoomToJoin}
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
