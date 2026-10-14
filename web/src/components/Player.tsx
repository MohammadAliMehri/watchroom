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
  ShieldAlert
} from 'lucide-react';
import type { PlaybackState } from '../hooks/useRoom';
import { getGradientPoster } from '../utils/gradientPoster';
import { mapServerError } from '../utils/errorMap';
import { Button } from '@/components/ui/button';

interface PlayerProps {
  playback: PlaybackState;
  isHost: boolean;
  hostOnly: boolean;
  onControl: (action: 'play' | 'pause' | 'seek' | 'changeItem', currentTime?: number, itemId?: string) => void;
  onNextItem?: () => void;
  onFocusLinkInput?: () => void;
  onRetry: () => void;
}

export const Player: React.FC<PlayerProps> = ({
  playback,
  isHost,
  hostOnly,
  onControl,
  onNextItem,
  onFocusLinkInput,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Local playback UI states (kept minimal so we don't trigger room re-renders)
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [drift, setDrift] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);

  // Controls auto-hide timer
  const hideTimerRef = useRef<any>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

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

  // Drive subtitle visibility through the text track mode; <track default> is unreliable once the element is added dynamically.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      for (const track of Array.from(video.textTracks)) {
        track.mode = subtitlesEnabled ? 'showing' : 'hidden';
      }
    };
    apply();
    video.textTracks.addEventListener('addtrack', apply);
    return () => video.textTracks.removeEventListener('addtrack', apply);
  }, [playback.subtitles, subtitlesEnabled]);

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
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(console.error);
            setIsFullscreen(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playback.isPlaying, currentTime, duration, volume, isMuted, canControl, onNextItem, onFocusLinkInput]);

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
    // Single tap toggles controls visibility
    setControlsVisible(prev => !prev);
  };

  const inSync = drift <= 1.5;
  const currentTitle = playback.currentItem?.title || 'WatchRoom';
  const posterGradient = getGradientPoster(currentTitle);

  const errorInfo = fatalError ? mapServerError(fatalError) : null;
  const prepErrorInfo = playback.prepareError ? mapServerError(playback.prepareError) : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Video Container (16:9 ratio, rounded-2xl, shadow) */}
      <div
        ref={containerRef}
        onMouseMove={showControls}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full aspect-16-9 bg-[#0b0d12] rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none flex items-center justify-center"
      >
        {/* Real HTML5 Video element */}
        <video
          ref={videoRef}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          playsInline
          className={`w-full h-full object-contain ${!playback.mediaSrc || playback.isPreparing ? 'hidden' : 'block'}`}
        >
          {playback.subtitles && (
            <track
              key={playback.subtitles}
              kind="subtitles"
              src={playback.subtitles}
              label="Subtitles"
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
                <h3 className="text-xl font-semibold text-white">Paste a movie link below to start.</h3>
                <p className="text-sm text-gray-400 max-w-sm">
                  WatchRoom supports MKV, MP4, WebM, AVI, MOV and TS streams.
                </p>
              </div>
            ) : playback.isPreparing ? (
              <div className="flex flex-col items-center gap-4 max-w-md">
                <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
                <div>
                  <h3 className="text-xl font-semibold text-white">Preparing video…</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    MKV and non-browser files are converted first for smooth playback.
                  </p>
                </div>
                {playback.prepareProgress > 0 && (
                  <div className="w-64 bg-gray-800 rounded-full h-2 overflow-hidden border border-white/10 mt-2">
                    <div
                      className="bg-violet-500 h-2 transition-all duration-300"
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

        {/* Error Overlay (fatal HLS or prepare error) */}
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
              <RotateCcw className="w-4 h-4" />
              Try again
            </Button>
          </div>
        )}

        {/* Video Overlay Controls */}
        <div
          className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex flex-col justify-between p-4 transition-opacity duration-200 ${controlsVisible || !playback.isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
          {/* Top Bar: Title & Subtitle toggle */}
          <div className="flex items-center justify-between text-white">
            <h3 className="text-sm font-medium truncate max-w-[70%] drop-shadow">
              {currentTitle}
            </h3>
            {playback.subtitles && (
              <Button
                onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                aria-label={subtitlesEnabled ? 'Disable subtitles' : 'Enable subtitles'}
                variant="ghost"
                size="icon"
                className={`border ${subtitlesEnabled
                    ? 'bg-violet-600/80 border-violet-400 text-white'
                    : 'bg-black/50 border-white/20 text-gray-400 hover:bg-black/70 hover:text-white'
                  }`}
              >
                <SubtitlesIcon className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Bottom Bar: Seekbar & Controls */}
          <div className="flex flex-col gap-2">
            {/* Seek Bar (Section 12.2: Do not animate with CSS transitions) */}
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

            {/* Play, Time, Volume, Fullscreen Buttons */}
            <div className="flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-3">
                {/* Play / Pause or Spinner */}
                <Button
                  onClick={togglePlay}
                  disabled={!canControl || playback.isPreparing || !playback.mediaSrc}
                  aria-label={playback.isPlaying ? 'Pause video' : 'Play video'}
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  {playback.isPreparing ? (
                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
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
                  className="size-8 text-gray-300 hover:bg-transparent hover:text-white"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => handleSeekDelta(10)}
                  disabled={!canControl || playback.isPreparing || !playback.mediaSrc}
                  aria-label="Forward 10 seconds"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-gray-300 hover:bg-transparent hover:text-white"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>

                {/* Time Display with tabular-nums */}
                <div className="tabular-nums font-mono text-gray-300 select-none">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-gray-500 mx-1">/</span>
                  <span className="text-gray-400">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Volume slider (hidden on mobile, uses device volume) */}
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    variant="ghost"
                    size="icon"
                    className="size-8 text-gray-300 hover:bg-transparent hover:text-white"
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
                  className="size-8 text-gray-300 hover:bg-transparent hover:text-white"
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

      {/* Sync pill & Status line (Section 12.5) */}
      <div className="flex items-center justify-between px-1 text-xs">
        {/* Sync Status Pill */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-colors ${inSync
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/60 border-amber-500/30 text-amber-300'
              }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${inSync ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                }`}
            />
            <span>{inSync ? 'In sync' : 'Catching up…'}</span>
          </div>

          {hostOnly && (
            <span className="text-[11px] text-gray-400">
              {isHost ? 'You are controlling playback' : 'Playback locked to host'}
            </span>
          )}
        </div>

        {/* Keyboard hints tooltip reminder */}
        <div className="hidden lg:flex items-center gap-3 text-gray-400 text-[11px]">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">Space</kbd> Play
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">←/→</kbd> 10s
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300">/</kbd> Add link
          </span>
        </div>
      </div>
    </div>
  );
};
