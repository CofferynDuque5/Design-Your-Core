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
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
});
