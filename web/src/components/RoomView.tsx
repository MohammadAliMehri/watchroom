import React, { useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { RoomHeader } from './RoomHeader';
import { Player } from './Player';
import { PlaylistPanel, type PlaylistPanelRef } from './PlaylistPanel';
import { ChatPanel } from './ChatPanel';
import type { useRoom } from '../hooks/useRoom';

interface RoomViewProps {
  roomHook: ReturnType<typeof useRoom>;
  currentUserName: string;
}

export const RoomView: React.FC<RoomViewProps> = ({ roomHook, currentUserName }) => {
  const playlistRef = useRef<PlaylistPanelRef>(null);

  const {
    activeRoomId,
    roomName,
    hostOnly,
    isHost,
    members,
    playlist,
    chatMessages,
    playback,
    connected,
    isRestoringRoom,
    sendControl,
    addToPlaylist,
    removeFromPlaylist,
    selectPlaylistItem,
    sendChat,
    retryPlayback,
    leaveRoom,
  } = roomHook;

  if (!activeRoomId) return null;

  const handleNextItem = () => {
    if (!playback.currentItem || playlist.length === 0) return;
    const currentIndex = playlist.findIndex(p => p.id === playback.currentItem?.id);
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      selectPlaylistItem(playlist[currentIndex + 1].id);
    }
  };

  const handleFocusLink = () => {
    playlistRef.current?.focusInput();
  };

  return (
    <div className="flex flex-col gap-4 pb-12 w-full max-w-7xl mx-auto">
      {(!connected || isRestoringRoom) && (
        <div role="status" className="flex items-center gap-2 border border-amber-400/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{isRestoringRoom ? 'Restoring room connection…' : 'Connection lost. Reconnecting…'}</span>
        </div>
      )}

      {/* Room Header */}
      <RoomHeader
        roomId={activeRoomId}
        roomName={roomName}
        isPlaying={playback.isPlaying}
        hostOnly={hostOnly}
        isHost={isHost}
        members={members}
        onLeave={leaveRoom}
      />

      {/* Main Responsive Grid:
          - Mobile / Tablet: single column (player -> playlist -> chat)
          - Desktop (xl: 1280px+): 2 columns (left: player + playlist, right: 360px chat panel)
      */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left Column: Player & Playlist */}
        <div className="flex flex-col gap-6 min-w-0">
          <Player
            playback={playback}
            isHost={isHost}
            hostOnly={hostOnly}
            onControl={sendControl}
            onNextItem={handleNextItem}
            onFocusLinkInput={handleFocusLink}
            onRetry={retryPlayback}
          />

          <PlaylistPanel
            ref={playlistRef}
            playlist={playlist}
            currentItemId={playback.currentItem?.id || null}
            canControl={!hostOnly || isHost}
            onSelectItem={selectPlaylistItem}
            onAddItem={addToPlaylist}
            onRemoveItem={removeFromPlaylist}
          />
        </div>

        {/* Right Column: Chat Panel */}
        <div className="w-full">
          <ChatPanel
            messages={chatMessages}
            currentUserName={currentUserName}
            onSendMessage={sendChat}
          />
        </div>
      </div>
    </div>
  );
};
