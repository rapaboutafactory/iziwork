import {eq,sql,type SQL} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from './db';
import {campaigns,sources} from './db/schema';
import {HttpError,logAudit} from './security';

const deletionSchema=z.object({id:z.uuid(),confirmation:z.string().min(1).max(200)});

export async function permanentDelete(section:string,input:unknown,actor:string){
 if(section!=='campaigns'&&section!=='sources')throw new HttpError(404,'Удаление этого раздела недоступно');
 const {id,confirmation}=deletionSchema.parse(input);
 return getDb().transaction(async tx=>{
  // Share the cleanup lock with retention. All staging tables are connection-local
  // and disappear on commit/rollback; no deletion queue or soft-deleted data remains.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(73491823)`);
  if(section==='campaigns'){
   const [row]=await tx.select().from(campaigns).where(eq(campaigns.id,id)).for('update');
   if(!row)throw new HttpError(404,'Кампания не найдена');
   if(confirmation!==row.name)throw new HttpError(400,'Для подтверждения введите точное название кампании');
  }else{
   const [row]=await tx.select().from(sources).where(eq(sources.id,id)).for('update');
   if(!row)throw new HttpError(404,'Источник не найден');
   if(confirmation!==row.code)throw new HttpError(400,'Для подтверждения введите постоянный код источника');
  }
  const sourceCondition=section==='campaigns'?sql`campaign_id=${id}::uuid`:sql`id=${id}::uuid`;
  await tx.execute(sql`CREATE TEMP TABLE iziwork_delete_sources ON COMMIT DROP AS SELECT id FROM sources WHERE ${sourceCondition} FOR UPDATE`);
  const eventCondition=sql`source_id IN (SELECT id FROM iziwork_delete_sources) ${section==='campaigns'?sql`OR campaign_id=${id}::uuid`:sql``}`;
  await tx.execute(sql`CREATE TEMP TABLE iziwork_delete_events ON COMMIT DROP AS SELECT id,session_id FROM events WHERE ${eventCondition}`);
  await tx.execute(sql`CREATE TEMP TABLE iziwork_delete_sessions ON COMMIT DROP AS SELECT id FROM sessions WHERE
   first_source_id IN (SELECT id FROM iziwork_delete_sources) OR last_source_id IN (SELECT id FROM iziwork_delete_sources)
   OR first_attribution->>'sourceId' IN (SELECT id::text FROM iziwork_delete_sources)
   OR last_attribution->>'sourceId' IN (SELECT id::text FROM iziwork_delete_sources)
   OR id IN (SELECT session_id FROM iziwork_delete_events)`);
  const count=async(query:SQL)=>{const result=await tx.execute(sql`WITH removed AS (${query} RETURNING 1) SELECT count(*) AS count FROM removed`);return Number((result as unknown as {rows:{count:string}[]}).rows[0].count);};
  const removedConversions=await count(sql`DELETE FROM conversions WHERE source_id IN (SELECT id FROM iziwork_delete_sources)
   OR click_id IN (SELECT id FROM iziwork_delete_events) ${section==='campaigns'?sql`OR campaign_id=${id}::uuid`:sql``}`);
  const removedEvents=await count(sql`DELETE FROM events WHERE id IN (SELECT id FROM iziwork_delete_events)`);
  const removedSessions=await count(sql`DELETE FROM sessions WHERE id IN (SELECT id FROM iziwork_delete_sessions)
   AND NOT EXISTS (SELECT 1 FROM events WHERE session_id=sessions.id)`);
  // A session may also contain other sources. Preserve their events and rebuild
  // the first/last touch from the remaining history, removing deleted attribution.
  await tx.execute(sql`UPDATE sessions s SET
   first_source_id=(SELECT e.source_id FROM events e WHERE e.session_id=s.id ORDER BY e.created_at,e.id LIMIT 1),
   first_attribution=(SELECT e.attribution FROM events e WHERE e.session_id=s.id ORDER BY e.created_at,e.id LIMIT 1),
   last_source_id=(SELECT e.source_id FROM events e WHERE e.session_id=s.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1),
   last_attribution=(SELECT e.attribution FROM events e WHERE e.session_id=s.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1)
   WHERE s.id IN (SELECT id FROM iziwork_delete_sessions)`);
  const removedHistory=await count(sql`DELETE FROM link_history WHERE source_id IN (SELECT id FROM iziwork_delete_sources)`);
  const removedAliases=await count(sql`DELETE FROM source_aliases WHERE source_id IN (SELECT id FROM iziwork_delete_sources)`);
  const removedAudit=await count(sql`DELETE FROM audit WHERE details->>'id' IN (SELECT id::text FROM iziwork_delete_sources)
   OR details->>'sourceId' IN (SELECT id::text FROM iziwork_delete_sources)
   ${section==='campaigns'?sql`OR details->>'id'=${id} OR details->>'campaignId'=${id}`:sql``}`);
  const removedSources=await count(sql`DELETE FROM sources WHERE id IN (SELECT id FROM iziwork_delete_sources)`);
  if(section==='campaigns')await tx.delete(campaigns).where(eq(campaigns.id,id));
  const removed={sources:removedSources,events:removedEvents,conversions:removedConversions,sessions:removedSessions,aliases:removedAliases,linkHistory:removedHistory,audit:removedAudit};
  // Keep only a minimal administrative action, without the deleted name, code,
  // identifiers, URLs or attribution payloads.
  await logAudit(actor,section==='campaigns'?'campaign.delete':'source.delete',removed,tx as unknown as ReturnType<typeof getDb>);
  return {ok:true,removed};
 });
}
