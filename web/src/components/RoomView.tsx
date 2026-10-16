import React, { useRef, useState } from "react";
import {
  WifiOff,
  MessageSquare,
  Film,
  Users,
  Maximize2,
  Minimize2,
  Tv,
} from "lucide-react";
import { MemberAvatar } from "./MemberAvatar";
import { RoomHeader } from "./RoomHeader";
import { Player } from "./Player";
import { PlaylistPanel, type PlaylistPanelRef } from "./PlaylistPanel";
import { ChatPanel } from "./ChatPanel";
import type { useRoom } from "../hooks/useRoom";
import { Button } from "@/components/ui/button";

interface RoomViewProps {
  roomHook: ReturnType<typeof useRoom>;
  currentUserName: string;
}

export const RoomView: React.FC<RoomViewProps> = ({
  roomHook,
  currentUserName,
}) => {
  const playlistRef = useRef<PlaylistPanelRef>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "playlist" | "viewers">(
    "chat",
  );
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const {
    activeRoomId,
    roomName,
    setRoomName,
    hostOnly,
    isHost,
    isOwner,
    members,
    playlist,
    chatMessages,
    playback,
    connected,
    isRestoringRoom,
    sendControl,
    addToPlaylist,
    addBatchToPlaylist,
    changeAudioTrack,
    removeFromPlaylist,
    movePlaylistItem,
    selectPlaylistItem,
    sendChat,
    retryPlayback,
    leaveRoom,
  } = roomHook;

  if (!activeRoomId) return null;

  const currentIndex = playlist.findIndex(
    (p) => p.id === playback.currentItem?.id,
  );
  const hasNextItem = currentIndex >= 0 && currentIndex < playlist.length - 1;
  const nextItemTitle = hasNextItem
    ? playlist[currentIndex + 1].title
    : undefined;

  const handleNextItem = () => {
    if (hasNextItem) {
      selectPlaylistItem(playlist[currentIndex + 1].id);
    }
  };

  const handleFocusLink = () => {
    setActiveTab("playlist");
    requestAnimationFrame(() => playlistRef.current?.focusInput());
  };

  return (
    <div className="flex flex-col gap-4 pb-12 w-full max-w-[1600px] mx-auto px-2 sm:px-4">
      {(!connected || isRestoringRoom) && (
        <div
          role="status"
          className="flex items-center gap-2 border border-amber-400/30 bg-amber-950/40 px-3.5 py-2.5 rounded-xl text-sm text-amber-200 backdrop-blur-md animate-in fade-in"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            {isRestoringRoom
              ? "Restoring room connection…"
              : "Connection lost. Reconnecting…"}
          </span>
        </div>
      )}

      {/* Room Header with Theater Mode Toggle */}
      <div className="flex flex-col gap-2">
        <RoomHeader
          roomId={activeRoomId}
          roomName={roomName}
          isPlaying={playback.isPlaying}
          hostOnly={hostOnly}
          isHost={isHost}
          isOwner={isOwner}
          members={members}
          onLeave={leaveRoom}
          onRoomRenamed={(newName) => setRoomName(newName)}
          onRoomDeleted={leaveRoom}
        />

        {/* Theater mode bar for desktop */}
        <div className="hidden lg:flex items-center justify-between px-1 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            {playback.currentItem && (
              <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                <Tv className="w-3.5 h-3.5 text-violet-400" />
                <span>
                  Now Playing:{" "}
                  <strong className="text-white font-semibold">
                    {playback.currentItem.title}
                  </strong>
                </span>
              </span>
            )}
          </div>

          <Button
            onClick={() => setIsTheaterMode(!isTheaterMode)}
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-1"
          >
            {isTheaterMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-violet-400" />
                <span>Standard Layout</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-violet-400" />
                <span>Theater Mode</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Responsive Layout Grid:
          In Theater Mode: Player takes full width, sidebar is stacked below
          In Standard Mode: 2 columns on desktop (Player + Sidebar), 1 column on mobile
      */}
      <div
        className={`grid gap-6 items-start ${
          isTheaterMode ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-[1fr_380px]"
        }`}
      >
        {/* Cinema Player Column */}
        <div className="flex flex-col gap-6 min-w-0">
          <Player
            playback={playback}
            isHost={isHost}
            hostOnly={hostOnly}
            hasNextItem={hasNextItem}
            nextItemTitle={nextItemTitle}
            onControl={sendControl}
            onNextItem={handleNextItem}
            onFocusLinkInput={handleFocusLink}
            onRetry={retryPlayback}
            onChangeAudioTrack={changeAudioTrack}
          />

          {/* Under player in theater mode or mobile: Playlist rendered below */}
          {isTheaterMode && (
            <PlaylistPanel
              ref={playlistRef}
              playlist={playlist}
              currentItemId={playback.currentItem?.id || null}
              canControl={!hostOnly || isHost}
              onSelectItem={selectPlaylistItem}
              onAddItem={addToPlaylist}
              onAddBatch={addBatchToPlaylist}
              onRemoveItem={removeFromPlaylist}
              onMoveItem={movePlaylistItem}
            />
          )}
        </div>

        {/* Right Cinema Sidebar Column (Chat, Playlist, Viewers tabs) */}
        {!isTheaterMode && (
          <div className="w-full flex flex-col gap-3">
            {/* Sidebar Tab Header */}
            <div className="flex items-center bg-[#10141f] border border-white/10 p-1 rounded-xl shadow-lg backdrop-blur-md">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "chat"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
                {chatMessages.length > 0 && (
                  <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full font-mono">
                    {chatMessages.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("playlist")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "playlist"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Playlist</span>
                {playlist.length > 0 && (
                  <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full font-mono">
                    {playlist.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("viewers")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "viewers"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Viewers ({members.length})</span>
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "chat" && (
              <ChatPanel
                messages={chatMessages}
                currentUserName={currentUserName}
                onSendMessage={sendChat}
              />
            )}

            {activeTab === "playlist" && (
              <PlaylistPanel
                ref={playlistRef}
                playlist={playlist}
                currentItemId={playback.currentItem?.id || null}
                canControl={!hostOnly || isHost}
                onSelectItem={selectPlaylistItem}
                onAddItem={addToPlaylist}
                onAddBatch={addBatchToPlaylist}
                onRemoveItem={removeFromPlaylist}
                onMoveItem={movePlaylistItem}
              />
            )}

            {activeTab === "viewers" && (
              <div className="bg-[#10141f]/90 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">
                    In This Room ({members.length})
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-white/5"
                    >
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar
                          name={m.name}
                          className="w-8 h-8 rounded-full border border-violet-500/40 bg-violet-950/40"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">
                            {m.name}
                          </span>
                          {m.name === currentUserName && (
                            <span className="text-[10px] text-gray-400 font-mono">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                      {m.isHost && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300 bg-violet-950/80 border border-violet-500/30 px-2 py-0.5 rounded-full">
                          Host
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
