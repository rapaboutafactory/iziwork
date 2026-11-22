import {randomUUID} from 'node:crypto';
import {and,eq,ne,desc,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from './db';
import {campaigns,sources,aliases,audit,linkHistory,settings as settingsTable} from './db/schema';
import {sourceSchema,campaignSchema,linksSchema,contentSchema,modesSchema,networks,normalizeUtm} from './validation';
import {getSettings,saveSettings} from './settings';
import {getReport,parseFilters,sourceView,confirmedResults} from './report';
import {HttpError,logAudit,asObject} from './security';
import {addConversion,importConversions} from './conversions';
import type {Settings,SocialLinks} from './contracts';
const txDb=(tx:unknown)=>tx as ReturnType<typeof getDb>;
export async function bootstrap(query:URLSearchParams){const f=await parseFilters(query);const [allCampaigns,allSources,settings,report,logs,history,results]=await Promise.all([getDb().select().from(campaigns).orderBy(desc(campaigns.createdAt)),getDb().select().from(sources).orderBy(desc(sources.createdAt)),getSettings(),getReport(f),getDb().select().from(audit).orderBy(desc(audit.createdAt)).limit(150),getDb().select().from(linkHistory).orderBy(desc(linkHistory.createdAt)).limit(150),confirmedResults(f)]);const metrics=new Map(report.sources.map(s=>[s.id,s.metrics]));return {campaigns:allCampaigns,sources:allSources.map(s=>({...sourceView(s),metrics:metrics.get(s.id)})),settings,report,audit:logs,linkHistory:history,confirmedResults:results};}
async function recordLinks(old:SocialLinks,next:SocialLinks,actor:string,sourceId:string|null,tx:ReturnType<typeof getDb>){for(const network of networks)if(old[network]!==next[network])await tx.insert(linkHistory).values({sourceId,network,oldUrl:old[network],newUrl:next[network],actor});}
export async function mutate(section:string,input:unknown,actor:string){
 const db=getDb();
 if(section==='campaigns'){
  const {id,...data}=campaignSchema.parse(input);return db.transaction(async tx=>{
   const [row]=id?await tx.update(campaigns).set(data).where(eq(campaigns.id,id)).returning():await tx.insert(campaigns).values(data).returning();if(!row)throw new HttpError(404,'Кампания не найдена');
   const inherited=await tx.update(sources).set({category:row.category!}).where(and(eq(sources.campaignId,row.id),ne(sources.category,row.category!))).returning({id:sources.id});
   await logAudit(actor,id?'campaign.update':'campaign.create',{id:row.id,...data,inheritedSources:inherited.length},txDb(tx));return row;
  });
 }
 if(section==='sources'){
  const {id,...data}=sourceSchema.parse(input);const u=normalizeUtm(new URLSearchParams({utm_source:data.utmSource,utm_medium:data.utmMedium,utm_campaign:data.utmCampaign,utm_content:data.utmContent,utm_term:data.utmTerm}));
  return db.transaction(async tx=>{
   const campaignId=data.campaignId||null;
   // Serialize source saves with campaign category changes, including moves between campaigns.
   const [campaign]=campaignId?await tx.select().from(campaigns).where(eq(campaigns.id,campaignId)).for('update'):[];
   if(campaignId&&!campaign)throw new HttpError(400,'Кампания не найдена');
   const category=campaign?(campaign.category||''):data.category;
   if(!campaign&&!category)throw new HttpError(400,'Укажите категорию источника или выберите категорию кампании');
   const values={...data,campaignId,category:category||'',utmSource:u.source||'',utmMedium:u.medium||'',utmCampaign:u.campaign||'',utmContent:u.content||'',utmTerm:u.term||''};
   if(id){const [old]=await tx.select().from(sources).where(eq(sources.id,id));if(!old)throw new HttpError(404,'Источник не найден');if(old.code!==values.code||old.printCode!==values.printCode)throw new HttpError(400,'Код и печатный код постоянны. Создайте новый источник для нового кода.');if(old.isTest!==values.isTest)throw new HttpError(400,'Нельзя менять тип тестовых данных существующего источника');const [row]=await tx.update(sources).set(values).where(eq(sources.id,id)).returning();await recordLinks(old.links,values.links,actor,id,txDb(tx));await logAudit(actor,'source.update',{id,...values},txDb(tx));return sourceView(row);}
   const [row]=await tx.insert(sources).values(values).returning();for(const code of new Set([row.code,row.printCode]))await tx.insert(aliases).values({code,sourceId:row.id});await logAudit(actor,'source.create',{id:row.id,...values},txDb(tx));return sourceView(row);
  });
 }
 if(section==='links'){
  const v=z.object({sourceId:z.union([z.uuid(),z.literal('')]).optional(),links:linksSchema,linkModes:modesSchema.optional()}).parse(input);
  return db.transaction(async tx=>{if(v.sourceId){const [old]=await tx.select().from(sources).where(eq(sources.id,v.sourceId));if(!old)throw new HttpError(404,'Источник не найден');await tx.update(sources).set({links:v.links}).where(eq(sources.id,v.sourceId));await recordLinks(old.links,v.links,actor,v.sourceId,txDb(tx));}
   else {await tx.execute(sql`SELECT pg_advisory_xact_lock(73491822)`);const current=await getSettingsInTx(txDb(tx));await saveSettings({...current,links:v.links,linkModes:v.linkModes||current.linkModes},txDb(tx));await recordLinks(current.links,v.links,actor,null,txDb(tx));}
   await logAudit(actor,'links.update',{sourceId:v.sourceId||null,links:v.links,linkModes:v.linkModes},txDb(tx));return {ok:true};});
 }
 if(section==='content'){
  const value=z.object({draft:contentSchema,publish:z.boolean().optional()}).parse(input);
  return db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(73491822)`);const s=await getSettingsInTx(txDb(tx));await saveSettings({...s,draft:value.draft,...(value.publish?{published:value.draft,metrikaId:value.draft.metrikaId}:{})},txDb(tx));await logAudit(actor,value.publish?'content.publish':'content.draft',{},txDb(tx));return {ok:true};});
 }
 if(section==='settings'){
  const v=z.object({timezone:z.string().max(100),retentionDays:z.coerce.number().int().min(1).max(730),categories:z.array(z.string().trim().min(1).max(80)).min(1).max(100),platforms:z.array(z.string().trim().min(1).max(100)).min(1).max(100),metrikaId:z.string().regex(/^\d{0,12}$/),linkModes:modesSchema.optional()}).parse(input);try{new Intl.DateTimeFormat('ru',{timeZone:v.timezone}).format();}catch{throw new HttpError(400,'Неверный часовой пояс');}
  return db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(73491822)`);const s=await getSettingsInTx(txDb(tx));await saveSettings({...s,...v,linkModes:v.linkModes||s.linkModes,published:{...s.published,metrikaId:v.metrikaId},draft:{...s.draft,metrikaId:v.metrikaId}},txDb(tx));await logAudit(actor,'settings.update',v,txDb(tx));return {ok:true};});
 }
 if(section==='conversions'){const obj=asObject(input);return addConversion({...obj,externalId:obj.externalId||randomUUID()},'manual',actor);}
 if(section==='import'){const v=z.object({csv:z.string().max(1024*1024)}).parse(input);return importConversions(v.csv,actor);}
 throw new HttpError(404,'Раздел не найден');
}
async function getSettingsInTx(db:ReturnType<typeof getDb>):Promise<Settings>{const [row]=await db.select().from(settingsTable).where(eq(settingsTable.id,'site'));const {defaultSettings}=await import('./settings');return {...defaultSettings,...row?.value} as Settings;}
