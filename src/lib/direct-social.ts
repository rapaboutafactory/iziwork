import {randomUUID} from 'node:crypto';
import type {Network} from './contracts';
import {clientKey,limit,HttpError} from './security';
import {recordEvent,resolveAttribution,findSource} from './tracking';
import {publicError} from './public-error';

// These three public aliases intentionally use the owner's exact addresses.
// Query parameters and configurable bot modes must never alter Location.
export const directSocialTargets:Readonly<Record<Network,string>>=Object.freeze({
 vk:'https://vk.ru/alekseevich143',
 telegram:'https://t.me/alekseevich_job',
 max:'https://max.ru/u/f9LHodD0cOIhdWgnjYqFrMRhiGpvLv-tvsh11QEkyXB5PGk4bTvc6XxyO1U',
});
// The permanent alias survives source/campaign renaming in the admin panel.
export const offlineBannerSourceCode='offline_banners';

export async function directSocialRedirect(request:Request,network:Network){
 try{
  await limit('outbound:'+clientKey(request.headers),120,60);
  if(request.method!=='HEAD'){
   const source=await findSource(offlineBannerSourceCode);
   if(!source)throw new HttpError(503,'Источник офлайн-баннеров ещё не настроен.');
   const attribution=await resolveAttribution(request.headers,new URL(request.url).searchParams,source);
   const requestId=randomUUID();
   await recordEvent({requestId:requestId+':in',type:'incoming',headers:request.headers,attribution,source,network});
   await recordEvent({requestId:requestId+':click',type:'print_click',headers:request.headers,attribution,source,network});
  }
  return new Response(null,{status:302,headers:{Location:directSocialTargets[network],'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){return publicError(error);}
}
