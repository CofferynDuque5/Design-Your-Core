import { afterEach, describe, expect, it } from 'vitest';
import { readYouTubeLength } from './youtubeLength';

/** Un YouTube de mentira: cada video dura lo que diga `lengths`, y tarda un poco en saberlo. */
function fakeYouTube(lengths: Record<string, number>, list: string[] = []) {
  class Player {
    index = 0;
    started = 0;
    vars: Record<string, unknown>;
    video: string;
    constructor(_el: HTMLElement, opts: { videoId?: string; playerVars: Record<string, unknown>; events: { onReady: () => void } }) {
      this.vars = opts.playerVars;
      this.video = opts.videoId ?? list[0];
      setTimeout(() => opts.events.onReady(), 10);
    }
    mute() {}
    playVideo() {
      this.started = Date.now();
    }
    stopVideo() {}
    destroy() {}
    playVideoAt(i: number) {
      this.index = i;
      this.video = list[i];
      this.started = Date.now();
    }
    getDuration() {
      return Date.now() - this.started > 100 ? (lengths[this.video] ?? 0) : 0;
    }
    getCurrentTime() {
      return 0;
    }
    getVideoData() {
      return { video_id: this.video, author: 'Canal de prueba', title: `Video ${this.video}` };
    }
    getPlaylist() {
      return this.vars.list ? list : null;
    }
    getPlaylistIndex() {
      return this.index;
    }
  }
  window.YT = { Player } as unknown as typeof window.YT;
}

afterEach(() => {
  delete window.YT;
});

describe('readYouTubeLength', () => {
  it('lee la duración, el canal y el nombre de un video', async () => {
    fakeYouTube({ abcdefghijk: 754.6 });
    await expect(readYouTubeLength('https://youtu.be/abcdefghijk')).resolves.toEqual({ seconds: 755, exact: true, author: 'Canal de prueba', title: 'Video abcdefghijk' });
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('suma los videos de una lista uno por uno', async () => {
    fakeYouTube({ aaaaaaaaaaa: 600, bbbbbbbbbbb: 900, ccccccccccc: 300 }, ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    const steps: string[] = [];
    const r = await readYouTubeLength('https://www.youtube.com/playlist?list=PLabcdefghijk', (d, t) => steps.push(`${d}/${t}`));
    expect(r).toEqual({
      seconds: 1800,
      exact: true,
      videos: 3,
      author: 'Canal de prueba',
      items: [
        { video: 'aaaaaaaaaaa', title: 'Video aaaaaaaaaaa', seconds: 600 },
        { video: 'bbbbbbbbbbb', title: 'Video bbbbbbbbbbb', seconds: 900 },
        { video: 'ccccccccccc', title: 'Video ccccccccccc', seconds: 300 },
      ],
    });
    expect(steps).toEqual(['1/3', '2/3', '3/3']);
  });
});
