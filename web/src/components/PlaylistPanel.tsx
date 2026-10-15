import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Plus, Film, Trash2, Layers, Link as LinkIcon, Tv, CheckCircle2 } from 'lucide-react';
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
  onAddBatch?: (items: { url: string; title?: string }[]) => Promise<{ success: boolean; count?: number; error?: string }>;
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
  onAddBatch,
  onRemoveItem,
}, ref) => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [batchText, setBatchText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus();
    }
  }));

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setErrorMessage(null);
    setSuccessNotice(null);
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

  // Parse batch lines into items
  const parseBatchUrls = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items: { url: string; title?: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Format 1: Title | URL
      if (line.includes('|')) {
        const [titlePart, urlPart] = line.split('|').map(s => s.trim());
        if (urlPart && /^https?:\/\//i.test(urlPart)) {
          items.push({ url: urlPart, title: titlePart });
          continue;
        }
      }
      // Format 2: Title: URL or Title - URL
      const sepMatch = line.match(/^(.+?)[\s]+[-:][\s]+(https?:\/\/.+)$/i);
      if (sepMatch) {
        items.push({ url: sepMatch[2].trim(), title: sepMatch[1].trim() });
        continue;
      }
      // Format 3: Direct URL
      const urlMatch = line.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        const url = urlMatch[1];
        try {
          const pathname = new URL(url).pathname;
          const filename = decodeURIComponent(pathname.split('/').pop() || '');
          items.push({ url, title: filename || `Episode ${i + 1}` });
        } catch {
          items.push({ url, title: `Episode ${i + 1}` });
        }
      }
    }
    return items;
  };

  const detectedBatchItems = parseBatchUrls(batchText);

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (detectedBatchItems.length === 0) {
      setErrorMessage('Please paste at least one valid HTTP/HTTPS video URL');
      return;
    }

    setErrorMessage(null);
    setSuccessNotice(null);
    setIsAdding(true);
    try {
      if (onAddBatch) {
        const res = await onAddBatch(detectedBatchItems);
        if (res.success) {
          setBatchText('');
          setSuccessNotice(`Successfully added ${res.count || detectedBatchItems.length} episodes to playlist!`);
          setTimeout(() => setSuccessNotice(null), 4000);
        } else if (res.error) {
          setErrorMessage(res.error);
        }
      } else {
        // Fallback: sequential adds
        for (const it of detectedBatchItems) {
          await onAddItem(it.url, it.title);
        }
        setBatchText('');
        setSuccessNotice(`Added ${detectedBatchItems.length} episodes!`);
        setTimeout(() => setSuccessNotice(null), 4000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add episodes');
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
    <Card className="flex flex-col gap-4 p-4 bg-[#10141f]/90 border-white/10 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Film className="w-4 h-4 text-violet-400" />
          <span>Playlist & Episodes</span>
          <span className="text-xs font-normal text-violet-300/70 tabular-nums bg-violet-950/60 border border-violet-500/20 px-2 py-0.5 rounded-full">
            {playlist.length}
          </span>
        </h3>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/5 text-xs">
          <button
            type="button"
            onClick={() => { setMode('single'); setErrorMessage(null); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
              mode === 'single'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Single URL</span>
          </button>
          <button
            type="button"
            onClick={() => { setMode('batch'); setErrorMessage(null); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
              mode === 'batch'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>TV Shows (Batch)</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Single Video Form */}
      {mode === 'single' && (
        <form onSubmit={handleAddSingle} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              ref={inputRef}
              type="url"
              placeholder="Paste video URL (MKV, MP4, WebM, TS, AVI...)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={isAdding}
              className="h-9 flex-1 rounded-lg border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
            />
            <Input
              type="text"
              placeholder="Title (optional)"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={isAdding}
              className="h-9 sm:w-44 rounded-lg border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
            />
            <Button
              type="submit"
              disabled={isAdding || !urlInput.trim()}
              aria-label="Add video to playlist"
              size="sm"
              className="h-9 bg-violet-600 text-white shadow-md shadow-violet-600/20 hover:bg-violet-500 shrink-0"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span>Add</span>
            </Button>
          </div>
        </form>
      )}

      {/* Mode 2: Batch Multiple URLs (TV Shows) Form */}
      {mode === 'batch' && (
        <form onSubmit={handleAddBatch} className="flex flex-col gap-2.5 bg-black/25 p-3 rounded-xl border border-white/5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1.5 font-medium text-violet-300">
              <Layers className="w-3.5 h-3.5" />
              Paste Multiple URLs (1 per line for TV shows/seasons):
            </span>
            {detectedBatchItems.length > 0 && (
              <span className="text-emerald-400 font-mono font-medium">
                {detectedBatchItems.length} episodes detected
              </span>
            )}
          </div>

          <textarea
            rows={4}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            disabled={isAdding}
            placeholder={`https://cdn.example.com/shows/breakingbad/s01e01.mkv\nhttps://cdn.example.com/shows/breakingbad/s01e02.mkv\nhttps://cdn.example.com/shows/breakingbad/s01e03.mkv\n\nOr: Episode 1 - https://cdn.example.com/.../ep1.mkv`}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs font-mono text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-violet-500 resize-y"
          />

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">
              Auto-names episodes and queues them in order.
            </span>
            <Button
              type="submit"
              disabled={isAdding || detectedBatchItems.length === 0}
              size="sm"
              className="h-8 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow hover:from-violet-500 hover:to-indigo-500 shrink-0 font-medium text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Add All {detectedBatchItems.length > 0 ? `(${detectedBatchItems.length})` : ''}</span>
            </Button>
          </div>
        </form>
      )}

      {/* Error & Success Messages */}
      {errorMessage && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 px-3 py-1.5 rounded-lg">
          {errorMessage}
        </p>
      )}
      {successNotice && (
        <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{successNotice}</span>
        </p>
      )}

      {/* Playlist Items List */}
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {playlist.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center justify-center gap-2 text-gray-500">
            <Tv className="w-8 h-8 opacity-40 text-violet-400" />
            <span className="text-sm">Playlist is empty</span>
            <span className="text-xs text-gray-600">Paste single URLs or whole TV show seasons above</span>
          </div>
        ) : (
          playlist.map((item, index) => {
            const isCurrent = item.id === currentItemId;
            return (
              <div
                key={item.id}
                onClick={() => canControl && onSelectItem(item.id)}
                className={`group flex items-center justify-between rounded-xl p-2.5 transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-violet-950/50 border border-violet-500/60 shadow-lg shadow-violet-950/40 ring-1 ring-violet-500/20'
                    : 'bg-black/30 hover:bg-[#1a202c]/60 border border-white/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <span className={`text-xs font-mono w-5 text-center font-bold ${isCurrent ? 'text-violet-400' : 'text-gray-500'}`}>
                    {index + 1}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {item.title}
                      </p>
                      {isCurrent && (
                        <Badge className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-violet-600 text-white animate-pulse">
                          Now Playing
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 truncate max-w-xs font-mono">
                      {item.url}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(item.durationSec ?? 0) > 0 && (
                    <span className="text-xs font-mono text-gray-400 tabular-nums">
                      {formatDuration(item.durationSec ?? 0)}
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
                      className="size-7 opacity-0 group-hover:opacity-100 text-gray-400 hover:bg-red-950/40 hover:text-red-400 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
});

PlaylistPanel.displayName = 'PlaylistPanel';

