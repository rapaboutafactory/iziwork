import {randomBytes} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {getDb} from '@/lib/db';
import {admins,adminSessions} from '@/lib/db/schema';
import {apiError,assertOrigin,readJson,limit,clientKey,verifyPassword,digest,logAudit,HttpError} from '@/lib/security';
import {secureCookies} from '@/lib/config';
import {z} from 'zod';
export async function POST(req:Request){try{assertOrigin(req.headers);await limit('login:'+clientKey(req.headers),5,900);const v=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(1).max(256)}).parse(await readJson(req,4096));const [admin]=await getDb().select().from(admins).where(eq(admins.email,v.email));
 const valid=await verifyPassword(v.password,admin?.passwordHash||'scrypt$dummy-salt$'+'0'.repeat(128));if(!admin||!valid)throw new HttpError(401,'Неверный email или пароль');
 const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');await getDb().insert(adminSessions).values({id:digest(token),adminId:admin.id,csrf,expiresAt:new Date(Date.now()+12*3600000)});await logAudit(admin.email,'auth.login',{});
 return Response.json({ok:true},{headers:{'Set-Cookie':`motiv_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookies()?'; Secure':''}`,'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
