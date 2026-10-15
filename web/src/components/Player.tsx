import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Loader2,
  AlertCircle,
  Subtitles as SubtitlesIcon,
  ShieldAlert,
  FastForward,
  Volume1,
  Upload,
  Check,
  Clock
} from 'lucide-react';
import type { PlaybackState, SubtitleTrack } from '../hooks/useRoom';
import { getGradientPoster } from '../utils/gradientPoster';
import { mapServerError } from '../utils/errorMap';
import { Button } from '@/components/ui/button';

interface PlayerProps {
  playback: PlaybackState;
  isHost: boolean;
  hostOnly: boolean;
  hasNextItem?: boolean;
  nextItemTitle?: string;
  onControl: (action: 'play' | 'pause' | 'seek' | 'changeItem', currentTime?: number, itemId?: string) => void;
  onNextItem?: () => void;
  onFocusLinkInput?: () => void;
  onRetry: () => void;
  onChangeAudioTrack?: (index: number) => void;
}

function srtToVtt(srtText: string): string {
  return 'WEBVTT\n\n' + srtText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

export const Player: React.FC<PlayerProps> = ({
  playback,
  isHost,
  hostOnly,
  hasNextItem,
  nextItemTitle,
  onControl,
  onNextItem,
  onFocusLinkInput,
  onRetry,
  onChangeAudioTrack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Controls auto-hide timer and touch refs
  const hideTimerRef = useRef<any>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  // Local playback UI states
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [drift, setDrift] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Subtitle options states
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [selectedSubTrackId, setSelectedSubTrackId] = useState<string>('default');
  const [customSubtitleUrl, setCustomSubtitleUrl] = useState<string | null>(null);
  const [customSubtitleLabel, setCustomSubtitleLabel] = useState<string>('');
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(18);
  const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState(false);
  const [isAudioMenuOpen, setIsAudioMenuOpen] = useState(false);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number>(0);

  const canControl = !hostOnly || isHost;

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const totalSecs = Math.floor(secs);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const getAriaTime = (current: number, total: number) => {
    const cM = Math.floor(current / 60);
    const cS = Math.floor(current % 60);
    const tM = Math.floor(total / 60);
    const tS = Math.floor(total % 60);
    return `${cM} minutes ${cS} seconds of ${tM} minutes ${tS} seconds`;
  };

  // Reset controls timer
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playback.isPlaying) {
        setControlsVisible(false);
      }
    }, 3000);
  }, [playback.isPlaying]);

  // Load video source (HLS vs native)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setFatalError(null);

    // Destroy existing Hls instance if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!playback.mediaSrc) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    const src = playback.mediaSrc;
    const isHls = playback.mediaType === 'hls' || src.includes('.m3u8');

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('Fatal HLS error:', data);
            setFatalError('Playback error (fatal HLS)');
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS on Safari
        video.src = src;
      }
    } else {
      // Direct MP4 / WebM
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playback.mediaSrc, playback.mediaType]);

  // All available subtitle tracks
  const allSubtitleTracks: SubtitleTrack[] = [
    ...(playback.subtitleTracks && playback.subtitleTracks.length > 0
      ? playback.subtitleTracks
      : playback.subtitles
      ? [{ id: 'default', label: 'Default Subtitles', src: playback.subtitles, default: true }]
      : []),
    ...(customSubtitleUrl ? [{ id: 'custom', label: customSubtitleLabel || 'Custom Subtitles', src: customSubtitleUrl }] : [])
  ];

  const activeSubtitleSrc = selectedSubTrackId === 'off'
    ? null
    : selectedSubTrackId === 'custom'
    ? customSubtitleUrl
    : selectedSubTrackId === 'default'
    ? (allSubtitleTracks.find(t => t.default)?.src || playback.subtitles || allSubtitleTracks[0]?.src || null)
    : (allSubtitleTracks.find(t => t.id === selectedSubTrackId)?.src || null);

  // Drive subtitle visibility through the text track mode
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      const tracks = Array.from(video.textTracks);
      for (const track of tracks) {
        track.mode = subtitlesEnabled && selectedSubTrackId !== 'off' ? 'showing' : 'hidden';
      }
    };
    apply();
    video.textTracks.addEventListener('addtrack', apply);
    return () => video.textTracks.removeEventListener('addtrack', apply);
  }, [activeSubtitleSrc, subtitlesEnabled, selectedSubTrackId]);

  // Sync engine: synchronizes playback state with room clock
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback.mediaSrc || playback.isPreparing) return;

    // Calculate room's expected time
    let expectedTime = playback.currentTime;
    if (playback.isPlaying) {
      const elapsed = (Date.now() - playback.updatedAt) / 1000;
      expectedTime += elapsed;
    }

    const currentLocal = video.currentTime;
    const currentDrift = Math.abs(currentLocal - expectedTime);
    setDrift(currentDrift);

    // If drift is greater than 1.5 seconds, correct it seamlessly
    if (currentDrift > 1.5) {
      video.currentTime = expectedTime;
    }

    // Match playing state
    if (playback.isPlaying && video.paused) {
      video.play().catch(() => {
        // Autoplay policy or buffering
      });
    } else if (!playback.isPlaying && !video.paused) {
      video.pause();
    }
  }, [playback.currentTime, playback.isPlaying, playback.updatedAt, playback.mediaSrc, playback.isPreparing]);

  // Handle local video element events
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (!isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }

    // Check drift periodically
    let expectedTime = playback.currentTime;
    if (playback.isPlaying) {
      const elapsed = (Date.now() - playback.updatedAt) / 1000;
      expectedTime += elapsed;
    }
    setDrift(Math.abs(videoRef.current.currentTime - expectedTime));
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
  };

  // User Actions (only fire on explicit user clicks)
  const togglePlay = () => {
    if (!canControl || playback.isPreparing || !playback.mediaSrc) return;
    const video = videoRef.current;
    const curr = video ? video.currentTime : currentTime;

    if (playback.isPlaying) {
      onControl('pause', curr);
    } else {
      onControl('play', curr);
    }
  };

  const handleSeek = (targetTime: number) => {
    if (!canControl || playback.isPreparing || !playback.mediaSrc) return;
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
    onControl('seek', targetTime);
  };

  const handleSeekDelta = (delta: number) => {
    if (!canControl || playback.isPreparing || !playback.mediaSrc) return;
    const newTime = Math.max(0, Math.min(duration || 99999, currentTime + delta));
    handleSeek(newTime);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (videoRef.current) {
      videoRef.current.muted = nextMute;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const handleSubtitleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      let vttContent = content;
      if (file.name.toLowerCase().endsWith('.srt')) {
        vttContent = srtToVtt(content);
      }
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      setCustomSubtitleUrl(blobUrl);
      setCustomSubtitleLabel(file.name);
      setSelectedSubTrackId('custom');
      setSubtitlesEnabled(true);
    };
    reader.readAsText(file);
  };

  // Keyboard shortcuts (Section 12.6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must never fire while user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setSubtitlesEnabled(prev => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeekDelta(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeekDelta(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.1));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          if (onNextItem) onNextItem();
          break;
        case '/':
          e.preventDefault();
          if (onFocusLinkInput) onFocusLinkInput();
          break;
        case 'Escape':
          if (isSubtitleModalOpen) {
            setIsSubtitleModalOpen(false);
          } else if (isAudioMenuOpen) {
            setIsAudioMenuOpen(false);
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(console.error);
            setIsFullscreen(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playback.isPlaying, currentTime, duration, volume, isMuted, canControl, onNextItem, onFocusLinkInput, isSubtitleModalOpen, isAudioMenuOpen]);

  // Touch handlers (Section 12.6)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartYRef.current;
    const now = Date.now();

    // Swipe down to exit fullscreen
    if (diffY > 80 && isFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
        setIsFullscreen(false);
      }
      return;
    }

    // Double tap left or right half to seek 10s
    if (now - lastTouchTimeRef.current < 300) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const touchX = e.changedTouches[0].clientX - rect.left;
        if (touchX < rect.width / 2) {
          handleSeekDelta(-10);
        } else {
          handleSeekDelta(10);
        }
      }
      lastTouchTimeRef.current = 0;
      return;
    }

    lastTouchTimeRef.current = now;
    setControlsVisible(prev => !prev);
  };

  const inSync = drift <= 1.5;
  const currentTitle = playback.currentItem?.title || 'WatchRoom';
  const posterGradient = getGradientPoster(currentTitle);

  const errorInfo = fatalError ? mapServerError(fatalError) : null;
  const prepErrorInfo = playback.prepareError ? mapServerError(playback.prepareError) : null;

  return (
    <div className="relative flex flex-col gap-2">
      {/* Cinema Ambient Glow Backdrop */}
      <div
        className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-indigo-600/10 to-cyan-500/20 blur-2xl rounded-3xl opacity-60 pointer-events-none transition-opacity duration-700"
        aria-hidden="true"
      />

      {/* Dynamic Cue Styling */}
      <style>{`
        video::cue {
          font-size: ${subtitleFontSize}px !important;
          line-height: 1.4 !important;
          background-color: rgba(0, 0, 0, 0.75) !important;
          color: #ffffff !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 1px #000 !important;
          font-family: system-ui, -apple-system, sans-serif !important;
        }
      `}</style>

      {/* Hidden Subtitle File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={handleSubtitleFileUpload}
      />

      {/* Video Container (16:9 ratio, rounded-2xl, shadow) */}
      <div
        ref={containerRef}
        onMouseMove={showControls}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full aspect-16-9 bg-[#0b0d12] rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none flex items-center justify-center z-10"
      >
        {/* Real HTML5 Video element */}
        <video
          ref={videoRef}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => {
            if (canControl && onNextItem && hasNextItem) {
              onNextItem();
            }
          }}
          playsInline
          className={`w-full h-full object-contain ${!playback.mediaSrc || playback.isPreparing ? 'hidden' : 'block'}`}
        >
          {activeSubtitleSrc && (
            <track
              key={`${activeSubtitleSrc}_${subtitleOffset}`}
              kind="subtitles"
              src={activeSubtitleSrc}
              label="Subtitles"
              default
            />
          )}
        </video>

        {/* Poster / Empty State (Section 12.4 & 12.8) */}
        {(!playback.mediaSrc || playback.isPreparing) && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center transition-transform duration-1000 motion-safe:group-hover:scale-105"
            style={{ background: posterGradient }}
          >
            {!playback.currentItem ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-violet-400">
                  <Play className="w-8 h-8 ml-1" />
                </div>
                <h3 className="text-xl font-semibold text-white">Paste a video link below to start.</h3>
                <p className="text-sm text-gray-400 max-w-sm">
                  WatchRoom converts MKV, MP4, WebM, AVI, MOV and TS streams for synchronized browser playback.
                </p>
              </div>
            ) : playback.isPreparing ? (
              <div className="flex flex-col items-center gap-4 max-w-md">
                <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
                <div>
                  <h3 className="text-xl font-semibold text-white">Preparing video…</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Converting stream & extracting subtitles for smooth sync.
                  </p>
                </div>
                {playback.prepareProgress > 0 && (
                  <div className="w-64 bg-gray-800 rounded-full h-2 overflow-hidden border border-white/10 mt-2">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-cyan-400 h-2 transition-all duration-300"
                      style={{ width: `${playback.prepareProgress}%` }}
                    />
                  </div>
                )}
                {playback.prepareProgress > 0 && (
                  <span className="text-xs font-mono text-gray-400 tabular-nums">
                    {playback.prepareProgress}%
                  </span>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Host only restriction overlay tooltip badge */}
        {!canControl && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full border border-yellow-500/30 text-yellow-300 text-xs font-medium">
            <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
            <span>Host controls only</span>
          </div>
        )}

        {/* Error Overlay */}
        {(errorInfo || prepErrorInfo) && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center gap-3">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <h4 className="text-lg font-semibold text-white">
              {(errorInfo || prepErrorInfo)?.title}
            </h4>
            <p className="text-sm text-gray-300 max-w-md">
              {(errorInfo || prepErrorInfo)?.description}
            </p>
            {(errorInfo || prepErrorInfo)?.nextStep && (
              <p className="text-xs text-gray-400">
                {(errorInfo || prepErrorInfo)?.nextStep}
              </p>
            )}
            <Button
              onClick={onRetry}
              className="mt-2 bg-violet-600 text-white hover:bg-violet-500"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Try again
            </Button>
          </div>
        )}

        {/* Subtitle Options Modal / Floating Panel */}
        {isSubtitleModalOpen && (
          <div
            className="absolute bottom-16 right-4 z-40 w-80 rounded-2xl bg-[#121622]/95 border border-white/10 p-4 text-white shadow-2xl backdrop-blur-xl flex flex-col gap-3 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                <SubtitlesIcon className="w-4 h-4" />
                Subtitles & Audio Settings
              </span>
              <button
                onClick={() => setIsSubtitleModalOpen(false)}
                className="text-gray-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>

            {/* Subtitle Toggle */}
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-300">Show Subtitles</span>
              <button
                onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${
                  subtitlesEnabled ? 'bg-violet-600' : 'bg-gray-700'
                }`}
              >
                <div
                  className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                    subtitlesEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Subtitle Track Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Select Track
              </span>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => { setSelectedSubTrackId('off'); setSubtitlesEnabled(false); }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    !subtitlesEnabled || selectedSubTrackId === 'off'
                      ? 'bg-violet-600/30 text-violet-300 font-semibold'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span>Off</span>
                  {(!subtitlesEnabled || selectedSubTrackId === 'off') && <Check className="w-3.5 h-3.5 text-violet-400" />}
                </button>

                {allSubtitleTracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedSubTrackId(t.id);
                      setSubtitlesEnabled(true);
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      subtitlesEnabled && selectedSubTrackId === t.id
                        ? 'bg-violet-600/30 text-violet-300 font-semibold'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{t.label}</span>
                    {subtitlesEnabled && selectedSubTrackId === t.id && (
                      <Check className="w-3.5 h-3.5 text-violet-400 shrink-0 ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Subtitle File Upload */}
            <div className="pt-2 border-t border-white/5 flex flex-col gap-1.5">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Custom .SRT / .VTT</span>
              </Button>
            </div>

            {/* Subtitle Font Size */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-xs text-gray-400">Size</span>
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5 text-xs">
                {[
                  { label: 'S', size: 14 },
                  { label: 'M', size: 18 },
                  { label: 'L', size: 24 },
                  { label: 'XL', size: 30 }
                ].map(s => (
                  <button
                    key={s.label}
                    onClick={() => setSubtitleFontSize(s.size)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      subtitleFontSize === s.size ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subtitle Timing / Sync Delay */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Sync Delay
                </span>
                <span className="font-mono text-violet-400 font-semibold">
                  {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubtitleOffset(prev => Math.round((prev - 0.5) * 10) / 10)}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300"
                >
                  -0.5s
                </button>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.1"
                  value={subtitleOffset}
                  onChange={(e) => setSubtitleOffset(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded accent-violet-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setSubtitleOffset(prev => Math.round((prev + 0.5) * 10) / 10)}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300"
                >
                  +0.5s
                </button>
                {subtitleOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setSubtitleOffset(0)}
                    className="text-[10px] text-gray-400 hover:text-white underline ml-1"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video Overlay Controls */}
        <div
          className={`absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/40 flex flex-col justify-between p-4 transition-opacity duration-200 z-30 ${
            controlsVisible || !playback.isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Top Bar: Title & Subtitle / Audio badges */}
          <div className="flex items-center justify-between text-white">
            <h3 className="text-sm font-medium truncate max-w-[60%] drop-shadow">
              {currentTitle}
            </h3>

            <div className="flex items-center gap-2">
              {/* Audio Stream Switcher if multi-audio exists */}
              {playback.audioStreams && playback.audioStreams.length > 1 && (
                <div className="relative">
                  <Button
                    onClick={() => setIsAudioMenuOpen(!isAudioMenuOpen)}
                    variant="ghost"
                    size="sm"
                    className="h-8 bg-black/60 border border-white/15 text-xs text-cyan-300 hover:bg-black/80 hover:text-white px-2.5 rounded-lg"
                  >
                    <Volume1 className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                    <span>Audio ({playback.audioStreams.length})</span>
                  </Button>

                  {isAudioMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-[#131722] border border-white/10 shadow-2xl p-1 z-50 flex flex-col gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {playback.audioStreams.map((a, idx) => (
                        <button
                          key={a.index}
                          onClick={() => {
                            setSelectedAudioIndex(idx);
                            setIsAudioMenuOpen(false);
                            onChangeAudioTrack?.(idx);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left ${
                            selectedAudioIndex === idx ? 'bg-cyan-950/60 text-cyan-300 font-semibold' : 'text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          <span className="truncate">{a.title || a.language}</span>
                          {selectedAudioIndex === idx && <Check className="w-3 h-3 text-cyan-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subtitles Options Trigger */}
              <Button
                onClick={() => setIsSubtitleModalOpen(!isSubtitleModalOpen)}
                aria-label="Subtitles & Options"
                variant="ghost"
                size="sm"
                className={`h-8 border text-xs px-2.5 rounded-lg transition-all ${
                  subtitlesEnabled && selectedSubTrackId !== 'off'
                    ? 'bg-violet-600/90 border-violet-400 text-white shadow-md shadow-violet-600/20'
                    : 'bg-black/60 border-white/20 text-gray-400 hover:bg-black/80 hover:text-white'
                }`}
              >
                <SubtitlesIcon className="w-3.5 h-3.5 mr-1" />
                <span>CC</span>
              </Button>
            </div>
          </div>

          {/* Bottom Bar: Seekbar & Controls */}
          <div className="flex flex-col gap-2">
            {/* Seek Bar */}
            <div className="relative flex items-center group/seek">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                disabled={!canControl || playback.isPreparing || !playback.mediaSrc}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                aria-label={`Video progress: ${getAriaTime(currentTime, duration)}`}
                className="w-full h-1.5 bg-white/25 rounded-lg appearance-none cursor-pointer accent-violet-500 hover:h-2 transition-[height] disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            {/* Play, Time, Volume, Next Episode, Fullscreen Buttons */}
            <div className="flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-3">
                {/* Play / Pause or Spinner */}
                <Button
                  onClick={togglePlay}
                  disabled={!canControl || playback.isPreparing || !playback.mediaSrc}
                  aria-label={playback.isPlaying ? 'Pause video' : 'Play video'}
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-xl bg-violet-600 text-white hover:bg-violet-500 hover:text-white shadow-lg shadow-violet-600/30"
                >
                  {playback.isPreparing ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  ) : playback.isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </Button>

                {/* 10s Rewind / FastForward */}
                <Button
                  onClick={() => handleSeekDelta(-10)}
                  disabled={!canControl || playback.isPreparing || !playback.mediaSrc}
                  aria-label="Rewind 10 seconds"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-gray-300 hover:bg-white/10 hover:text-white rounded-lg"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => handleSeekDelta(10)}
                  disabled={!canControl || playback.isPreparing || !playback.mediaSrc}
                  aria-label="Forward 10 seconds"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-gray-300 hover:bg-white/10 hover:text-white rounded-lg"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>

                {/* Next Episode Button */}
                {hasNextItem && onNextItem && (
                  <Button
                    onClick={onNextItem}
                    disabled={!canControl}
                    title={nextItemTitle ? `Next: ${nextItemTitle}` : 'Next episode'}
                    aria-label="Next episode"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-violet-300 hover:bg-violet-600/20 hover:text-white rounded-lg"
                  >
                    <FastForward className="w-4 h-4" />
                  </Button>
                )}

                {/* Time Display with tabular-nums */}
                <div className="tabular-nums font-mono text-gray-300 select-none">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-gray-500 mx-1">/</span>
                  <span className="text-gray-400">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Volume slider */}
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    variant="ghost"
                    size="icon"
                    className="size-8 text-gray-300 hover:bg-white/10 hover:text-white rounded-lg"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    aria-label="Volume"
                    className="w-16 h-1 bg-white/20 rounded accent-violet-500 cursor-pointer"
                  />
                </div>

                {/* Fullscreen Button */}
                <Button
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  variant="ghost"
                  size="icon"
                  className="size-8 text-gray-300 hover:bg-white/10 hover:text-white rounded-lg"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sync pill & Status line */}
      <div className="flex items-center justify-between px-1 text-xs">
        {/* Sync Status Pill */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-colors ${
              inSync
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/60 border-amber-500/30 text-amber-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                inSync ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span>{inSync ? 'In sync' : 'Catching up…'}</span>
          </div>

          {hostOnly && (
            <span className="text-[11px] text-gray-400">
              {isHost ? 'You are controlling playback' : 'Playback locked to host'}
            </span>
          )}

          {activeSubtitleSrc && subtitlesEnabled && (
            <span className="text-[10px] text-violet-400/80 bg-violet-950/40 border border-violet-500/20 px-2 py-0.5 rounded-full font-mono">
              CC: {allSubtitleTracks.find(t => t.id === selectedSubTrackId)?.label || 'Active'}
            </span>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="hidden lg:flex items-center gap-3 text-gray-400 text-[11px]">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">Space</kbd> Play
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">C</kbd> Subs
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">←/→</kbd> 10s
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">N</kbd> Next
          </span>
        </div>
      </div>
    </div>
  );
};
