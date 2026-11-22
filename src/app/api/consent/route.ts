import {z} from 'zod';
import {assertOrigin,apiError,readJson,unsign,sign,HttpError,clientKey,limit} from '@/lib/security';
import {optionalAnalyticsEnabled,secureCookies} from '@/lib/config';
export async function POST(req:Request){try{assertOrigin(req.headers);await limit('consent:'+clientKey(req.headers),30,60);
 if(!optionalAnalyticsEnabled()){
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'}),secure=secureCookies()?'; Secure':'';
  for(const name of ['motiv_consent','motiv_session'])headers.append('Set-Cookie',`${name}=; Path=/; SameSite=Lax; Max-Age=0${name==='motiv_session'?'; HttpOnly':''}${secure}`);
  return new Response(JSON.stringify({error:'Необязательная аналитика отключена'}),{status:410,headers});
 }
 const {analytics,token}=z.object({analytics:z.boolean(),token:z.string().max(4096)}).parse(await readJson(req,8192));const data=unsign<{sid:string;sourceId:string|null}>(token);if(!data)throw new HttpError(400,'Обновите страницу');const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});const secure=secureCookies()?'; Secure':'';headers.append('Set-Cookie',`motiv_consent=${analytics?'accepted':'declined'}; Path=/; SameSite=Lax; Max-Age=15552000${secure}`);headers.append('Set-Cookie',analytics?`motiv_session=${sign({sid:data.sid,sourceId:data.sourceId},1800)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${secure}`:`motiv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);return new Response(JSON.stringify({ok:true}),{headers});}catch(e){return apiError(e);}}
