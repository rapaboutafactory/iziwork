import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual, createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { authSecret,appUrl } from './config';
import { getDb } from './db';
import { rateLimits, adminSessions,admins,audit } from './db/schema';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function hmac(value:string){return createHmac('sha256',authSecret()).update(value).digest('base64url');}
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function sign(data:Record<string,unknown>,seconds=1800){const body=Buffer.from(JSON.stringify({...data,exp:Math.floor(Date.now()/1000)+seconds})).toString('base64url');return body+'.'+hmac(body);}
export function unsign<T>(token:string|undefined|null):T|null {try{if(!token||token.length>4096) return null;const [body,sig,extra]=token.split('.');if(extra||!sig||!equal(hmac(body),sig)) return null;const p=JSON.parse(Buffer.from(body,'base64url').toString());if(p.exp<Math.floor(Date.now()/1000))return null;return p;}catch{return null;}}
export function cookie(headers:Headers,name:string){return headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export function clientKey(headers:Headers){
 // Only our Caddy replaces X-Forwarded-For. Do not enable TRUST_PROXY behind an untrusted proxy.
 const ip=process.env.TRUST_PROXY==='true'?(headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown'):'local';
 return hmac(new Date().toISOString().slice(0,10)+'|'+ip);
}
export async function limit(key:string,max:number,seconds:number){
 const now=new Date(); const end=new Date(now.getTime()+seconds*1000);
 const [row]=await getDb().insert(rateLimits).values({key,count:1,expiresAt:end}).onConflictDoUpdate({target:rateLimits.key,set:{count:sql`CASE WHEN ${rateLimits.expiresAt} <= ${now} THEN 1 ELSE ${rateLimits.count}+1 END`,expiresAt:sql`CASE WHEN ${rateLimits.expiresAt} <= ${now} THEN ${end} ELSE ${rateLimits.expiresAt} END`}}).returning();
 if(row.count>max) throw new HttpError(429,'Слишком много запросов. Повторите позже.');
}
export function assertOrigin(headers:Headers){if(headers.get('origin')!==appUrl())throw new HttpError(403,'Недопустимый источник запроса');}
const derive=(pass:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>nodeScrypt(pass,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return 'scrypt$'+salt+'$'+(await derive(password,salt)).toString('hex');}
export async function verifyPassword(password:string,hash:string){const [kind,salt,value]=hash.split('$');if(kind!=='scrypt'||!salt||!value)return false;return equal((await derive(password,salt)).toString('hex'),value);}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function getAdmin(headers:Headers){const token=cookie(headers,'motiv_admin');if(!token)return null;const [row]=await getDb().select({id:admins.id,email:admins.email,csrf:adminSessions.csrf,session:adminSessions.id}).from(adminSessions).innerJoin(admins,eq(adminSessions.adminId,admins.id)).where(and(eq(adminSessions.id,digest(token)),gt(adminSessions.expiresAt,new Date())));return row||null;}
export async function requireAdmin(headers:Headers,mutate=false){const user=await getAdmin(headers);if(!user)throw new HttpError(401,'Требуется авторизация');if(mutate){assertOrigin(headers);if(!equal(headers.get('x-csrf-token')||'',user.csrf))throw new HttpError(403,'Недействительный CSRF-токен');}return user;}
export async function logAudit(actor:string,action:string,details:unknown,db=getDb()){await db.insert(audit).values({actor,action,details});}
export async function readJson(request:Request,max=1024*1024){const length=Number(request.headers.get('content-length')||0);if(length>max)throw new HttpError(413,'Слишком большой запрос');const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Пустой запрос');let size=0;const chunks:Uint8Array[]=[];while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw new HttpError(413,'Слишком большой запрос');}chunks.push(r.value);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new HttpError(400,'Некорректный JSON');}}
export function asObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Ожидается JSON-объект');return value as Record<string,unknown>;}
export function apiError(e:unknown){if(e instanceof HttpError)return Response.json({error:e.message},{status:e.status});if(e && typeof e==='object' && 'issues' in e)return Response.json({error:'Проверьте данные',issues:(e as {issues:unknown}).issues},{status:400});let cause=e;for(let depth=0;depth<4&&cause&&typeof cause==='object';depth++){const err=cause as {code?:string;cause?:unknown};if(err.code==='23505')return Response.json({error:'Этот код или идентификатор уже используется'},{status:409});if(err.code==='23503'||err.code==='23514'||err.code==='22P02')return Response.json({error:'Проверьте значения и связанные записи'},{status:400});cause=err.cause;}console.error('Request failed',e instanceof Error?e.message:'unknown');return Response.json({error:'Не удалось выполнить запрос. Проверьте журнал сервера.'},{status:500});}
