import { youtubeRef, type CourseLength } from '@dyc/core';
import { loadApi, type YTPlayer } from '../components/YouTubePlayer';

/**
 * Cuánto dura un video o una lista de YouTube, leído en el navegador con un
 * reproductor invisible y sin sonido (YouTube no deja que el servidor lea su
 * página muchas veces). En una lista se pasa video por video sumando.
 * Devuelve también el canal y, si es un video, su nombre.
 */

interface Reader extends YTPlayer {
  mute(): void;
  playVideo(): void;
  stopVideo(): void;
  playVideoAt(i: number): void;
}

/** Hasta cuántos videos de una lista se miden uno por uno. */
const MAX_VIDEOS = 200;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repite `get` cada 250 ms hasta que dé algo o pase `ms`. */
async function until<T>(get: () => T | null | undefined, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = get();
      if (v) return v;
    } catch {
      /* el reproductor aún no está listo */
    }
    await wait(250);
  }
  return null;
}

export async function readYouTubeLength(url: string, onStep?: (done: number, total: number) => void): Promise<CourseLength> {
  const ref = youtubeRef(url);
  if (!ref) throw new Error('No es un enlace de YouTube.');
  const YT = await Promise.race([loadApi(), wait(10_000).then(() => Promise.reject(new Error('YouTube no respondió.')))]);
  // Fuera de la pantalla pero con tamaño real: YouTube no reproduce en 0×0.
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;';
  const el = document.createElement('div');
  box.appendChild(el);
  document.body.appendChild(box);
  let failed = false;
  const player = await new Promise<Reader>((resolve, reject) => {
    const p = new YT.Player(el, {
      width: 320,
      height: 180,
      ...(ref.video && !ref.list ? { videoId: ref.video } : {}),
      playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0, ...(ref.list ? { list: ref.list, listType: 'playlist' } : {}) },
      events: {
        onReady: () => {
          const r = p as Reader;
          r.mute();
          r.playVideo();
          resolve(r);
        },
        onError: () => {
          failed = true;
        },
      },
    });
    setTimeout(() => reject(new Error('YouTube no respondió.')), 15_000);
  }).catch((e: Error) => {
    box.remove();
    throw e;
  });
  try {
    const data = () => player.getVideoData() ?? {};
    if (!ref.list) {
      const seconds = await until(() => (failed ? -1 : player.getDuration()), 15_000);
      if (!seconds || seconds < 0) throw new Error('YouTube no dijo cuánto dura.');
      const d = data();
      return { seconds: Math.round(seconds), exact: true, ...(d.author ? { author: d.author } : {}), ...(d.title ? { title: d.title } : {}) };
    }
    const ids = await until(() => {
      const l = player.getPlaylist();
      return l && l.length ? l : null;
    }, 15_000);
    if (!ids) throw new Error('No pude abrir la lista.');
    const count = Math.min(ids.length, MAX_VIDEOS);
    let total = 0;
    let measured = 0;
    let author = '';
    for (let i = 0; i < count; i++) {
      if (i > 0) player.playVideoAt(i);
      failed = false;
      // Un video privado o borrado avisa con error: se salta y la suma queda aproximada.
      const seconds = await until(() => (failed ? -1 : data().video_id === ids[i] ? player.getDuration() : null), 8_000);
      if (seconds && seconds > 0) {
        total += seconds;
        measured++;
        author ||= data().author ?? '';
      }
      onStep?.(i + 1, ids.length);
    }
    if (!measured) throw new Error('YouTube no dijo cuánto dura.');
    const exact = measured === ids.length;
    return {
      seconds: Math.round(exact ? total : (total / measured) * ids.length),
      exact,
      videos: ids.length,
      ...(author ? { author } : {}),
    };
  } finally {
    try {
      player.stopVideo();
      player.destroy();
    } catch {
      /* ya no existe */
    }
    box.remove();
  }
}
