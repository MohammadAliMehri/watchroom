import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Plus, Film, Trash2 } from 'lucide-react';
import type { PlaylistItem } from '../hooks/useRoom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface PlaylistPanelProps {
  playlist: PlaylistItem[];
  currentItemId: string | null;
  canControl: boolean;
  onSelectItem: (id: string) => void;
  onAddItem: (url: string, title?: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveItem: (id: string) => void;
}

export interface PlaylistPanelRef {
  focusInput: () => void;
}

export const PlaylistPanel = forwardRef<PlaylistPanelRef, PlaylistPanelProps>(({
  playlist,
  currentItemId,
  canControl,
  onSelectItem,
  onAddItem,
  onRemoveItem,
}, ref) => {
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus();
    }
  }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setErrorMessage(null);
    setIsAdding(true);
    try {
      const res = await onAddItem(urlInput.trim(), titleInput.trim());
      if (res.success) {
        setUrlInput('');
        setTitleInput('');
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add link');
    } finally {
      setIsAdding(false);
    }
  };

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Film className="w-4 h-4 text-violet-400" />
          <span>Playlist</span>
          <span className="text-xs font-normal text-gray-400 tabular-nums">
            ({playlist.length})
          </span>
        </h3>
      </div>

      {/* Add Movie Link Form */}
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="url"
            placeholder="Paste video link (MKV, MP4, WebM, AVI, TS...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={isAdding}
            className="h-9 flex-1 rounded-lg border-white/10 px-3 py-2 placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
          />
          <Button
            type="submit"
            disabled={isAdding || !urlInput.trim()}
            aria-label="Add video to playlist"
            size="sm"
            className="h-9 bg-violet-600 text-white shadow-sm hover:bg-violet-500"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>

        {errorMessage && (
          <p className="text-xs text-red-400 mt-0.5">
            {errorMessage}
          </p>
        )}
      </form>

      {/* Playlist Items List */}
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {playlist.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Playlist is empty.
          </div>
        ) : (
          playlist.map((item, index) => {
            const isCurrent = item.id === currentItemId;
            return (
              <Card
                key={item.id}
                onClick={() => canControl && onSelectItem(item.id)}
                className={`group flex items-center justify-between rounded-lg p-2.5 transition-all ${
                  isCurrent
                    ? 'bg-[#1f2430] border-violet-500/50 shadow-sm'
                    : 'bg-black/20 hover:bg-[#1f2430]/60 border-white/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <span className="text-xs text-gray-500 font-mono w-4 text-center">
                    {index + 1}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">
                        {item.title}
                      </p>
                      {isCurrent && (
                        <Badge className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          Now
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 truncate max-w-xs">
                      {item.url}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.duration > 0 && (
                    <span className="text-xs font-mono text-gray-400 tabular-nums">
                      {formatDuration(item.duration)}
                    </span>
                  )}

                  {canControl && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(item.id);
                      }}
                      aria-label="Remove item from playlist"
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 text-gray-400 hover:bg-transparent hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </Card>
  );
});

PlaylistPanel.displayName = 'PlaylistPanel';
