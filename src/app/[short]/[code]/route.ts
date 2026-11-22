import {trackOutbound} from '@/lib/tracking';
import {apiError,HttpError} from '@/lib/security';
import type {Network} from '@/lib/contracts';
import {publicError} from '@/lib/public-error';
const channels:Record<string,Network>={v:'vk',t:'telegram',m:'max'};
export async function GET(req:Request,{params}:{params:Promise<{short:string;code:string}>}){try{const p=await params;const network=channels[p.short];if(!network)throw new HttpError(404,'Страница не найдена');const {target}=await trackOutbound(req.headers,network,{code:p.code});return new Response(null,{status:302,headers:{Location:target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch(e){return publicError(e);}}
export async function HEAD(){return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
