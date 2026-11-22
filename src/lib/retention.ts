import {lt,sql} from 'drizzle-orm';
import {getDb} from './db';
import {events,sessions,conversions,adminSessions,rateLimits,dedup,audit,linkHistory} from './db/schema';
import {getSettings} from './settings';
export async function cleanup(){const db=getDb(),settings=await getSettings();const cutoff=new Date(Date.now()-settings.retentionDays*86400000),auditCutoff=new Date(Date.now()-Math.max(30,Number(process.env.AUDIT_RETENTION_DAYS||365))*86400000);const result:Record<string,number>={};
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(73491823)`);
  for(const [name,table,column,date]of [['conversions',conversions,conversions.occurredAt,cutoff],['events',events,events.createdAt,cutoff],['sessions',sessions,sessions.lastAt,cutoff],['adminSessions',adminSessions,adminSessions.expiresAt,new Date()],['rateLimits',rateLimits,rateLimits.expiresAt,new Date()],['dedup',dedup,dedup.expiresAt,new Date()],['audit',audit,audit.createdAt,auditCutoff],['linkHistory',linkHistory,linkHistory.createdAt,auditCutoff]] as const){const r=await tx.execute(sql`WITH removed AS (DELETE FROM ${table} WHERE ${column} < ${date} RETURNING 1) SELECT count(*) AS count FROM removed`);result[name]=Number((r as unknown as {rows:{count:string}[]}).rows[0].count);}
 });return result;
}
