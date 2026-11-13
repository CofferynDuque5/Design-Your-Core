import { useEffect, useRef, useState } from 'react';

/**
 * Reproductor de YouTube (API IFrame) que avisa de dónde va el video: al
 * pausar, al terminar, cada 15 s mientras se ve y al cerrarse.
 */

export interface PlaybackState {
  position: number;
  duration: number;
  video: string;
  index: number;
  count: number;
}

export interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): { video_id?: string; author?: string; title?: string };
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  destroy(): void;
}
export interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;
export function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('No se pudo cargar YouTube.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

export function YouTubePlayer({ video, list, start, title, onProgress }: { video: string; list: string; start: number; title: string; onProgress: (s: PlaybackState) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onProgress);
  report.current = onProgress;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;
    const snapshot = () => {
      if (!player) return;
      try {
        const duration = player.getDuration();
        if (!duration) return;
        const playlist = player.getPlaylist();
        report.current({ position: player.getCurrentTime(), duration, video: player.getVideoData().video_id ?? video, index: Math.max(0, player.getPlaylistIndex() ?? 0), count: playlist?.length ?? 1 });
      } catch {
        /* el reproductor ya no existe */
      }
    };
    loadApi()
      .then((YT) => {
        if (!alive || !host.current) return;
        const el = document.createElement('div');
        host.current.appendChild(el);
        player = new YT.Player(el, {
          width: '100%',
          height: '100%',
          ...(video ? { videoId: video } : {}),
          playerVars: { start: Math.floor(start), rel: 0, playsinline: 1, ...(list ? { list, listType: 'playlist' } : {}) },
          events: {
            onStateChange: (e: { data: number }) => {
              clearInterval(timer);
              if (e.data === PLAYING) timer = setInterval(snapshot, 15_000);
              if (e.data === PAUSED || e.data === ENDED) snapshot();
            },
            onError: () => setError('Este video no se puede ver aquí. Ábrelo en YouTube.'),
          },
        });
        const iframe = el.tagName === 'IFRAME' ? el : host.current.querySelector('iframe');
        iframe?.setAttribute('title', `Video: ${title}`);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      clearInterval(timer);
      snapshot();
      player?.destroy();
    };
    // Se monta una vez por curso: cambiar de video lo hace el propio reproductor (listas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="yt-player">
      <div ref={host} className="yt-player__frame" />
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
