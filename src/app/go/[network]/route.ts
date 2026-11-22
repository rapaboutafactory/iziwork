import {trackOutbound} from '@/lib/tracking';
import {apiError,HttpError} from '@/lib/security';
import {networks} from '@/lib/validation';
import type {Network} from '@/lib/contracts';
import {renewVisitorCookie} from '@/lib/visitor-cookie';
import {publicError} from '@/lib/public-error';
import {outboundPage} from '@/lib/outbound-page';
export async function GET(req:Request,{params}:{params:Promise<{network:string}>}){try{const {network}=await params;if(!networks.includes(network as Network))throw new HttpError(404,'Площадка не найдена');const query=new URL(req.url).searchParams,token=query.get('token')||'';if(query.get('newtab')==='1')return await outboundPage(req.headers,network as Network,token);const {target,sessionId,sourceId}=await trackOutbound(req.headers,network as Network,{token});const headers=new Headers({Location:target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});renewVisitorCookie(headers,req.headers,sessionId,sourceId);return new Response(null,{status:302,headers});}catch(e){return publicError(e);}}
export async function HEAD(){return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
