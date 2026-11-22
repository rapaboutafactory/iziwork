import {eq} from 'drizzle-orm';
import {getDb} from '@/lib/db';
import {adminSessions} from '@/lib/db/schema';
import {requireAdmin,apiError,logAudit} from '@/lib/security';
export async function POST(req:Request){try{const user=await requireAdmin(req.headers,true);await getDb().delete(adminSessions).where(eq(adminSessions.id,user.session));await logAudit(user.email,'auth.logout',{});return Response.json({ok:true},{headers:{'Set-Cookie':'motiv_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}});}catch(e){return apiError(e);}}
