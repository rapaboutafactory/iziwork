import './env';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {z} from 'zod';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../src/lib/db';
import {admins,adminSessions} from '../src/lib/db/schema';
import {hashPassword,logAudit} from '../src/lib/security';
async function main(){let email=process.env.ADMIN_EMAIL,password=process.env.ADMIN_PASSWORD;const rl=createInterface({input:stdin,output:stdout});try{if(!email)email=await rl.question('Email администратора: ');if(!password){if(!stdin.isTTY)throw new Error('Задайте ADMIN_PASSWORD через окружение или запустите команду в интерактивном терминале');console.log('Введите пароль (минимум 12 символов):');rl.close();password=await new Promise<string>((resolve,reject)=>{let value='';stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');const listener=(key:string)=>{if(key==='\r'||key==='\n'){stdin.setRawMode(false);stdin.pause();stdin.off('data',listener);stdout.write('\n');resolve(value);}else if(key==='\u0003'){stdin.setRawMode(false);stdin.off('data',listener);reject(new Error('Отменено'));}else if(key==='\u007f'||key==='\b')value=value.slice(0,-1);else value+=key;};stdin.on('data',listener);});}}finally{rl.close();}
 const v=z.object({email:z.email().max(254),password:z.string().min(12).max(256)}).parse({email:email?.trim().toLowerCase(),password});const db=getDb();const [existing]=await db.select().from(admins).where(eq(admins.email,v.email));if(existing&&process.env.RESET_ADMIN_PASSWORD!=='true')throw new Error('Администратор существует. Для сброса используйте RESET_ADMIN_PASSWORD=true.');
 const passwordHash=await hashPassword(v.password);await db.transaction(async tx=>{if(existing){await tx.update(admins).set({passwordHash}).where(eq(admins.id,existing.id));await tx.delete(adminSessions).where(eq(adminSessions.adminId,existing.id));}else await tx.insert(admins).values({email:v.email,passwordHash});await logAudit('cli',existing?'admin.password_reset':'admin.create',{email:v.email},tx as unknown as ReturnType<typeof getDb>);});console.log('Администратор готов:',v.email);
}
main().then(closeDb).catch(async e=>{console.error(e.message);await closeDb();process.exitCode=1;});
