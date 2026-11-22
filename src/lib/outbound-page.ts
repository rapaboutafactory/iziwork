import type {Network} from './contracts';
import {HttpError,unsign,limit,clientKey} from './security';

// The first document in the new tab becomes a landing-history entry. Only the
// following normal server redirect records the click, so this bridge cannot double-count it.
export async function outboundPage(headers:Headers,network:Network,token:string){
 const visit=unsign<{sid:string;sourceId:string|null}>(token);
 if(!visit||!/^[a-f0-9-]{36}$/i.test(visit.sid))throw new HttpError(400,'Ссылка устарела. Вернитесь на главную страницу.');
 await limit('outbound-bridge:'+clientKey(headers),120,60);
 const back='/?entry='+encodeURIComponent(token),forward=`/go/${network}?token=${encodeURIComponent(token)}`;
 const script=`const back=${JSON.stringify(back)},forward=${JSON.stringify(forward)};history.replaceState(null,'',back);addEventListener('pageshow',event=>{if(event.persisted)location.replace(back);else setTimeout(()=>location.assign(forward),0)});`;
 return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Переходим в соцсеть · IziWork</title></head><body><p>Открываем выбранную площадку…</p><a href="${forward}">Продолжить</a> · <a href="${back}">Вернуться на сайт</a><script>${script}</script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
