import {findSource,trackEntry} from '@/lib/tracking';
import {apiError,HttpError} from '@/lib/security';
import {appUrl} from '@/lib/config';
import {publicError} from '@/lib/public-error';
export async function GET(req:Request,{params}:{params:Promise<{code:string}>}){try{const {code}=await params;const source=await findSource(code);if(!source)throw new HttpError(404,'Источник не найден');const entry=await trackEntry(req.headers,new URL(req.url).searchParams,source);const target=new URL('/',appUrl());target.searchParams.set('entry',entry);return new Response(null,{status:302,headers:{Location:target.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch(e){return publicError(e);}}
export async function HEAD(){return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
