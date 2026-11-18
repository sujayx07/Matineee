import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { expectedPosition } from '../lib/clock';
import { loadYouTubeApi } from '../lib/youtubeApi';
import { useRoom } from '../state/room';

/** YT.PlayerState values, inlined so we don't depend on the global before it loads. */
const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

/** Drift beyond this while playing triggers a corrective seek. */
const DRIFT_TOLERANCE = 0.75;

export type PlayerPhase = 'loading' | 'idle' | 'playing' | 'paused' | 'buffering' | 'ended';

const ERRORS: Record<number, string> = {
  2: 'That link doesn’t point to a valid video.',
  5: 'This video can’t be played in an embedded player.',
  100: 'This video was removed or made private.',
  101: 'The owner doesn’t allow this video to be embedded.',
  150: 'The owner doesn’t allow this video to be embedded.',
};

export interface SyncedPlayer {
  ready: boolean;
  phase: PlayerPhase;
  error: string | null;
  /** Browser blocked autoplay — we need a click before we can start. */
  needsGesture: boolean;
  /** Seconds ahead (+) or behind (−) the room clock. */
  drift: number;
  resume: () => void;
  getTime: () => number;
  getDuration: () => number;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
}

/**
 * Drives a YouTube iframe from the room's authoritative playback state.
 *
 * The player never decides anything on its own: native controls are hidden
 * and clicks are intercepted, so the only way playback changes is via
 * `sync_state` from the server. That removes the classic echo problem
 * (a programmatic pause firing a "user paused" event back to the server).
 */
export function useSyncedPlayer(mountRef: RefObject<HTMLDivElement | null>, opts: { onEnded: (duration: number) => void }): SyncedPlayer {
  const playerRef = useRef<YT.Player | null>(null);
  const loadedVideo = useRef<string | null>(null);
  const gestureTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onEndedRef = useRef(opts.onEnded);
  onEndedRef.current = opts.onEnded;

  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [drift, setDrift] = useState(0);

  const needsGestureRef = useRef(needsGesture);
  needsGestureRef.current = needsGesture;

  const playback = useRoom((s) => s.playback);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  // ── create the player once ──
  useEffect(() => {
    let disposed = false;
    loadYouTubeApi()
      .then((YTApi) => {
        const host = mountRef.current;
        if (disposed || !host) return;
        const el = document.createElement('div');
        host.appendChild(el);
        playerRef.current = new YTApi.Player(el, {
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (disposed) return;
              const vol = Number(localStorage.getItem('matinee:volume') ?? 80);
              playerRef.current?.setVolume(Number.isFinite(vol) ? vol : 80);
              if (localStorage.getItem('matinee:muted') === '1') playerRef.current?.mute();
              setReady(true);
              setPhase('idle');
            },
            onStateChange: (e) => onState(e.data),
            onError: (e) => setError(ERRORS[e.data as number] ?? 'This video couldn’t be played.'),
          },
        });
      })
      .catch(() => setError('The YouTube player couldn’t load. Check your connection or ad blocker.'));

    return () => {
      disposed = true;
      clearTimeout(gestureTimer.current);
      try {
        playerRef.current?.destroy();
      } catch {
        /* iframe already gone */
      }
      playerRef.current = null;
      loadedVideo.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onState = (state: number) => {
    const p = playerRef.current;
    const want = playbackRef.current;
    switch (state) {
      case S.PLAYING:
        setPhase('playing');
        setNeedsGesture(false);
        // YouTube sometimes starts on its own (seekTo on a cued video). Hold it.
        if (want && !want.playing) p?.pauseVideo();
        break;
      case S.PAUSED:
        setPhase('paused');
        break;
      case S.BUFFERING:
        setPhase('buffering');
        break;
      case S.ENDED:
        setPhase('ended');
        if (want?.playing && p) onEndedRef.current(p.getDuration());
        break;
      case S.CUED:
        setPhase('paused');
        break;
      default:
        break;
    }
  };

  const checkGesture = useCallback(() => {
    clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => {
      const p = playerRef.current;
      const want = playbackRef.current;
      if (!p || !want?.playing) return;
      const st = p.getPlayerState();
      if (st !== S.PLAYING && st !== S.BUFFERING && st !== S.ENDED) setNeedsGesture(true);
    }, 1800);
  }, []);

  /** Bring the player in line with the authoritative state. Idempotent. */
  const apply = useCallback(() => {
    const p = playerRef.current;
    const want = playbackRef.current;
    if (!p || !ready || !want) return;

    if (!want.videoId) {
      if (loadedVideo.current) p.stopVideo();
      loadedVideo.current = null;
      setPhase('idle');
      return;
    }

    const target = expectedPosition(want);
    if (loadedVideo.current !== want.videoId) {
      loadedVideo.current = want.videoId;
      setError(null);
      setPhase('loading');
      if (want.playing) {
        p.loadVideoById({ videoId: want.videoId, startSeconds: target });
        checkGesture();
      } else {
        p.cueVideoById({ videoId: want.videoId, startSeconds: target });
      }
      return;
    }

    const state = p.getPlayerState();
    const tolerance = want.playing ? DRIFT_TOLERANCE : 0.3;
    if (Math.abs(p.getCurrentTime() - target) > tolerance) p.seekTo(target, true);
    if (want.playing) {
      if (state !== S.PLAYING && state !== S.BUFFERING) {
        p.playVideo();
        checkGesture();
      }
    } else if (state === S.PLAYING || state === S.BUFFERING) {
      p.pauseVideo();
    }
  }, [ready, checkGesture]);

  // Re-apply whenever the server state changes.
  useEffect(() => {
    apply();
  }, [apply, playback?.seq, playback?.videoId, playback?.playing]);

  // ── drift correction loop ──
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const p = playerRef.current;
      const want = playbackRef.current;
      if (!p || !want?.videoId || loadedVideo.current !== want.videoId) return;
      const state = p.getPlayerState();
      if (!want.playing) {
        if (state === S.PLAYING) p.pauseVideo();
        setDrift(0);
        return;
      }
      const target = expectedPosition(want);
      const duration = p.getDuration();
      if (state === S.ENDED || (duration > 0 && target >= duration - 0.5)) {
        setDrift(0);
        return;
      }
      if (state === S.PLAYING) {
        const d = p.getCurrentTime() - target;
        setDrift(d);
        if (Math.abs(d) > DRIFT_TOLERANCE) p.seekTo(target, true);
      } else if ((state === S.PAUSED || state === S.CUED) && !needsGestureRef.current) {
        p.playVideo();
        checkGesture();
      }
    };
    const id = setInterval(tick, 1000);
    // Background tabs throttle timers; snap back into place on return.
    const onVisible = () => document.visibilityState === 'visible' && apply();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, apply, checkGesture]);

  const resume = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    setNeedsGesture(false);
    const want = playbackRef.current;
    if (want) p.seekTo(expectedPosition(want), true);
    p.playVideo();
  }, []);

  return {
    ready,
    phase,
    error,
    needsGesture,
    drift,
    resume,
    getTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
    getDuration: () => playerRef.current?.getDuration?.() ?? 0,
    setVolume: (v) => {
      playerRef.current?.setVolume(v);
      localStorage.setItem('matinee:volume', String(v));
    },
    setMuted: (m) => {
      if (m) playerRef.current?.mute();
      else playerRef.current?.unMute();
      localStorage.setItem('matinee:muted', m ? '1' : '0');
    },
  };
}
