import {cookie,sign} from './security';
import {secureCookies} from './config';
export function renewVisitorCookie(headers:Headers,requestHeaders:Headers,sid:string|null,sourceId:string|null){if(sid&&cookie(requestHeaders,'motiv_consent')==='accepted')headers.append('Set-Cookie',`motiv_session=${sign({sid,sourceId},1800)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${secureCookies()?'; Secure':''}`);}
