import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/**
 * Video de YouTube dentro de la app (API IFrame en un WebView). Avisa de
 * dónde va al pausar, al terminar, cada 15 s mientras se ve y cuando se le
 * pide (`snapshot`, al cerrar).
 */

export interface PlaybackState {
  position: number;
  duration: number;
  video: string;
  index: number;
  count: number;
}

export interface YouTubeViewHandle {
  snapshot: () => void;
}

// YouTube pide una página de origen para dejar ver el video incrustado.
const ORIGIN = 'https://designyourcorepanel.nvcorx.com';

export function playerHtml(cfg: { video: string; list: string; start: number }): string {
  const json = JSON.stringify({ ...cfg, origin: ORIGIN }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}#p{position:absolute;inset:0}</style></head><body><div id="p"></div><script>
var cfg=${json};var player,timer;
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
function send(){try{var d=player.getDuration();if(!d)return;var pl=player.getPlaylist();post({type:'progress',position:player.getCurrentTime(),duration:d,video:(player.getVideoData()||{}).video_id||'',index:Math.max(0,player.getPlaylistIndex()||0),count:pl?pl.length:1})}catch(e){}}
window.onYouTubeIframeAPIReady=function(){var vars={start:cfg.start,rel:0,playsinline:1,origin:cfg.origin};if(cfg.list){vars.list=cfg.list;vars.listType='playlist'}player=new YT.Player('p',{width:'100%',height:'100%',videoId:cfg.video||undefined,playerVars:vars,events:{onStateChange:function(e){clearInterval(timer);if(e.data===1)timer=setInterval(send,15000);if(e.data===2||e.data===0)send()},onError:function(e){post({type:'error',code:e.data})}}})};
var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=function(){post({type:'error',code:-1})};document.head.appendChild(s);
</script></body></html>`;
}

const ALLOWED = /^(about:blank|https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|google\.com|gstatic\.com|googlevideo\.com|designyourcorepanel\.nvcorx\.com)(\/|$))/;

export const YouTubeView = forwardRef<YouTubeViewHandle, { video: string; list: string; start: number; title: string; onProgress: (s: PlaybackState) => void; onError: () => void }>(function YouTubeView(
  { video, list, start, title, onProgress, onError },
  ref,
) {
  const web = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({ snapshot: () => web.current?.injectJavaScript('send();true;') }), []);
  // Solo al abrir: después el propio reproductor lleva la cuenta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => playerHtml({ video, list, start: Math.floor(start) }), []);
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string } & PlaybackState;
      if (m.type === 'progress' && m.duration > 0) onProgress(m);
      if (m.type === 'error') onError();
    } catch {
      /* mensaje que no es nuestro */
    }
  };
  return (
    <View style={st.frame} accessibilityLabel={`Video: ${title}`}>
      <WebView
        ref={web}
        source={{ html, baseUrl: ORIGIN }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        onShouldStartLoadWithRequest={(r) => {
          if (ALLOWED.test(r.url) || r.url.startsWith(ORIGIN)) return true;
          Linking.openURL(r.url).catch(() => undefined);
          return false;
        }}
        style={{ backgroundColor: '#000' }}
      />
    </View>
  );
});

const st = StyleSheet.create({
  // Fuera de la vista pero con tamaño real: YouTube no reproduce en 0×0.
  hidden: { position: 'absolute', left: -1000, top: 0, width: 320, height: 180, opacity: 0 },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
});

/**
 * Cuánto dura un video o una lista de YouTube, leído con un reproductor
 * invisible y sin sonido dentro de un WebView (YouTube no deja que el servidor
 * lea su página muchas veces). Manda `{type:'step'}` mientras mide una lista y
 * al final `{type:'length', seconds, exact, videos?, author?, title?}` o `{type:'fail'}`.
 */
export function lengthReaderHtml(cfg: { video: string; list: string }): string {
  const json = JSON.stringify({ ...cfg, origin: ORIGIN }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000"><div id="p"></div><script>
var cfg=${json};var player,failed=false;
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
function until(get,ms){return new Promise(function(res){var end=Date.now()+ms;(function tick(){var v=null;try{v=get()}catch(e){}if(v)return res(v);if(Date.now()>end)return res(null);setTimeout(tick,250)})()})}
function data(){try{return player.getVideoData()||{}}catch(e){return {}}}
function done(o){try{player.stopVideo()}catch(e){}post(o)}
async function run(){
if(!cfg.list){var s=await until(function(){return failed?-1:player.getDuration()},15000);if(!s||s<0)return done({type:'fail'});var d=data();return done({type:'length',seconds:Math.round(s),exact:true,author:d.author||'',title:d.title||''})}
var ids=await until(function(){var l=player.getPlaylist();return l&&l.length?l:null},15000);if(!ids)return done({type:'fail'});
var n=Math.min(ids.length,200),total=0,measured=0,author='';
for(var i=0;i<n;i++){if(i>0)player.playVideoAt(i);failed=false;var s=await until(function(){return failed?-1:(data().video_id===ids[i]?player.getDuration():null)},8000);if(s&&s>0){total+=s;measured++;author=author||data().author||''}post({type:'step',done:i+1,total:ids.length})}
if(!measured)return done({type:'fail'});var exact=measured===ids.length;
done({type:'length',seconds:Math.round(exact?total:total/measured*ids.length),exact:exact,videos:ids.length,author:author})}
window.onYouTubeIframeAPIReady=function(){var vars={autoplay:1,mute:1,controls:0,playsinline:1,rel:0,origin:cfg.origin};if(cfg.list){vars.list=cfg.list;vars.listType='playlist'}player=new YT.Player('p',{width:320,height:180,videoId:cfg.list?undefined:(cfg.video||undefined),playerVars:vars,events:{onReady:function(){player.mute();player.playVideo();run()},onError:function(){failed=true}}})};
var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=function(){post({type:'fail'})};document.head.appendChild(s);
</script></body></html>`;
}

export interface LengthFound {
  seconds: number;
  exact: boolean;
  videos?: number;
  author?: string;
  title?: string;
}

/** Reproductor invisible que mide `video`/`list` y avisa con `onDone(null)` si no pudo. */
export function YouTubeLengthReader({ video, list, onStep, onDone }: { video: string; list: string; onStep?: (done: number, total: number) => void; onDone: (r: LengthFound | null) => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => lengthReaderHtml({ video, list }), []);
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; done?: number; total?: number } & LengthFound;
      if (m.type === 'step') onStep?.(m.done ?? 0, m.total ?? 0);
      if (m.type === 'fail') onDone(null);
      if (m.type === 'length' && m.seconds > 0)
        onDone({ seconds: m.seconds, exact: m.exact, ...(m.videos ? { videos: m.videos } : {}), ...(m.author ? { author: m.author } : {}), ...(m.title ? { title: m.title } : {}) });
    } catch {
      /* mensaje que no es nuestro */
    }
  };
  return (
    <View style={st.hidden} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        source={{ html, baseUrl: ORIGIN }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onShouldStartLoadWithRequest={(r) => ALLOWED.test(r.url) || r.url.startsWith(ORIGIN)}
      />
    </View>
  );
}
