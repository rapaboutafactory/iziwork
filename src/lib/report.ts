import {sql,type SQL,eq} from 'drizzle-orm';
import {getDb} from './db';
import {sources,campaigns} from './db/schema';
import {getSettings} from './settings';
import type {Metrics,Report,Source,Campaign} from './contracts';
import {appUrl} from './config';
import {HttpError} from './security';
import {offlineBannerSourceCode} from './direct-social';
export interface Filters {from:string;to:string;timezone:string;dataMode:string;quality:string;campaignId:string;sourceId:string;platform:string;partner:string;category:string;creative:string;device:string}
export async function parseFilters(q:URLSearchParams):Promise<Filters>{const settings=await getSettings();const timezone=q.get('timezone')||settings.timezone;try{new Intl.DateTimeFormat('ru',{timeZone:timezone}).format();}catch{throw new HttpError(400,'Некорректный часовой пояс');}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const from=q.get('from')||new Date(new Date(today).getTime()-29*86400000).toISOString().slice(0,10),to=q.get('to')||today;
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>732*86400000)throw new HttpError(400,'Период: корректные даты, не более 732 дней, начало не позже конца');
 const field=(k:string,max=200)=>(q.get(k)||'').slice(0,max);
 for(const k of ['sourceId','campaignId'])if(field(k)&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(field(k)))throw new HttpError(400,'Некорректный идентификатор фильтра');
 return {from,to,timezone,dataMode:['test','all'].includes(field('dataMode'))?field('dataMode'):'live',quality:field('quality')==='raw'?'raw':'clean',sourceId:field('sourceId'),campaignId:field('campaignId'),platform:field('platform'),partner:field('partner'),category:field('category'),creative:field('creative'),device:field('device')};
}
export function sourceConditions(f:Filters):SQL[]{const parts:SQL[]=[];if(f.sourceId)parts.push(sql`s.id=${f.sourceId}::uuid`);if(f.platform)parts.push(sql`s.platform=${f.platform}`);if(f.partner)parts.push(sql`s.partner ILIKE ${'%'+f.partner+'%'}`);if(f.category)parts.push(sql`s.category=${f.category}`);if(f.creative)parts.push(sql`s.creative=${f.creative}`);return parts;}
export function eventWhere(f:Filters,clean=true):SQL{
 const parts:SQL[]=[sql`e.created_at >= (${f.from}::date::timestamp AT TIME ZONE ${f.timezone})`,sql`e.created_at < ((${f.to}::date + 1)::timestamp AT TIME ZONE ${f.timezone})`,...sourceConditions(f)];
 if(f.dataMode!=='all')parts.push(sql`e.is_test=${f.dataMode==='test'}`);if(clean&&f.quality==='clean')parts.push(sql`e.clean=true`);if(f.device)parts.push(sql`e.device=${f.device}`);if(f.campaignId)parts.push(sql`e.campaign_id=${f.campaignId}::uuid`);return sql.join(parts,sql` AND `);
}
function conversionWhere(f:Filters){const p:SQL[]=[sql`c.occurred_at >= (${f.from}::date::timestamp AT TIME ZONE ${f.timezone})`,sql`c.occurred_at < ((${f.to}::date + 1)::timestamp AT TIME ZONE ${f.timezone})`,...sourceConditions(f)];if(f.dataMode!=='all')p.push(sql`c.is_test=${f.dataMode==='test'}`);if(f.campaignId)p.push(sql`c.campaign_id=${f.campaignId}::uuid`);if(f.device)p.push(sql`ce.device=${f.device}`);return sql.join(p,sql` AND `);}
export async function rows<T>(query:SQL):Promise<T[]>{return (await getDb().execute(query) as unknown as {rows:T[]}).rows;}
const metricNumber=(v:unknown)=>Number(v||0);
export function makeMetrics(row:Record<string,unknown>={},cost=0,confirmed=0,leads=0):Metrics{
 const visits=metricNumber(row.visits),sessionCount=metricNumber(row.sessions),clicks=metricNumber(row.clicks),convertedSessions=metricNumber(row.converted);
 return {incoming:metricNumber(row.incoming),visits,sessions:sessionCount,vk:metricNumber(row.vk),telegram:metricNumber(row.telegram),max:metricNumber(row.max),clicks,convertedSessions,conversion:sessionCount?Math.min(100,convertedSessions/sessionCount*100):0,confirmed,cost,costPerVisit:visits?cost/visits:null,costPerSession:sessionCount?cost/sessionCount:null,costPerClick:clicks?cost/clicks:null,costPerLead:leads?cost/leads:null};
}
export function sourceView(s:typeof sources.$inferSelect):Source {const base=appUrl(),print=s.printCode||s.code;const social=s.code===offlineBannerSourceCode?{vk:`${base}/vk`,telegram:`${base}/tg`,max:`${base}/max`}:{vk:`${base}/v/${print}`,telegram:`${base}/t/${print}`,max:`${base}/m/${print}`};return {...s,campaignId:s.campaignId,createdAt:s.createdAt.toISOString(),urls:{main:`${base}/r/${s.code}`,...social}};}
async function aggregate(f:Filters,group:'source_id'|'campaign_id'|'total'){
 const g=group==='total'?sql`'total'`:sql.raw('f.'+group);
 return rows<Record<string,unknown>>(sql`WITH f AS (SELECT e.* FROM events e LEFT JOIN sources s ON s.id=e.source_id WHERE ${eventWhere(f)}),
 views AS (SELECT DISTINCT session_id,source_id,campaign_id FROM f WHERE type='landing_view' AND session_id IS NOT NULL)
 SELECT ${g} AS key,
 count(*) FILTER(WHERE f.type='incoming') AS incoming,count(*) FILTER(WHERE f.type='landing_view') AS visits,
 count(DISTINCT f.session_id) FILTER(WHERE f.type='landing_view') AS sessions,
 count(*) FILTER(WHERE f.type IN ('social_click','print_click') AND network='vk') AS vk,
 count(*) FILTER(WHERE f.type IN ('social_click','print_click') AND network='telegram') AS telegram,
 count(*) FILTER(WHERE f.type IN ('social_click','print_click') AND network='max') AS max,
 count(*) FILTER(WHERE f.type IN ('social_click','print_click')) AS clicks,
 count(DISTINCT f.session_id) FILTER(WHERE f.type='social_click' AND EXISTS(SELECT 1 FROM views v WHERE v.session_id=f.session_id ${group==='source_id'?sql`AND v.source_id IS NOT DISTINCT FROM f.source_id`:group==='campaign_id'?sql`AND v.campaign_id IS NOT DISTINCT FROM f.campaign_id`:sql``})) AS converted
 FROM f ${group==='total'?sql``:sql`GROUP BY ${g}`}`);
}
export async function getReport(f:Filters):Promise<Report>{
 const results=await Promise.all([
  getDb().select().from(sources),getDb().select().from(campaigns),aggregate(f,'total'),aggregate(f,'source_id'),aggregate(f,'campaign_id'),
  rows<{date:string;visits:string;clicks:string}>(sql`SELECT to_char(e.created_at AT TIME ZONE ${f.timezone},'YYYY-MM-DD') AS date,count(*) FILTER(WHERE type='landing_view') AS visits,count(*) FILTER(WHERE type IN ('social_click','print_click')) AS clicks FROM events e LEFT JOIN sources s ON s.id=e.source_id WHERE ${eventWhere(f)} GROUP BY date ORDER BY date`),
  rows<{sourceId:string;campaignId:string|null;date:string;type:string;count:string}>(sql`SELECT c.source_id AS "sourceId", c.campaign_id AS "campaignId",to_char(c.occurred_at AT TIME ZONE ${f.timezone},'YYYY-MM-DD') AS date,c.type,sum(c.count) AS count FROM conversions c JOIN sources s ON s.id=c.source_id LEFT JOIN events ce ON ce.id=c.click_id WHERE ${conversionWhere(f)} GROUP BY c.source_id,c.campaign_id,date,c.type`),
  rows<{raw:string;clean:string}>(sql`SELECT count(*) AS raw,count(*) FILTER(WHERE e.clean) AS clean FROM events e LEFT JOIN sources s ON s.id=e.source_id WHERE ${eventWhere(f,false)}`)
 ]);
 const [allSources,allCampaigns,total,bySource,byCampaign,dailyRows,confirmedRows,quality]=results;
 const selected=allSources.filter(s=>(f.dataMode==='all'||s.isTest===(f.dataMode==='test'))&&(!f.sourceId||s.id===f.sourceId)&&(!f.campaignId||s.campaignId===f.campaignId)&&(!f.platform||s.platform===f.platform)&&(!f.partner||s.partner.toLowerCase().includes(f.partner.toLowerCase()))&&(!f.category||s.category===f.category)&&(!f.creative||s.creative===f.creative));
 const confirmation=(id?:string,campaign=false,lead=false)=>confirmedRows.filter(r=>(!id||(campaign?r.campaignId:r.sourceId)===id)&&(!lead||r.type==='lead')).reduce((a,r)=>a+Number(r.count),0);
 const map=new Map(bySource.map(r=>[r.key,r]));const cm=new Map(byCampaign.map(r=>[r.key,r]));
 const sourceReport=selected.map(s=>({...sourceView(s),metrics:makeMetrics(map.get(s.id),s.cost,confirmation(s.id),confirmation(s.id,false,true))}));
 const campaignReport=allCampaigns.filter(c=>!f.campaignId||c.id===f.campaignId).map(c=>({...c,createdAt:c.createdAt.toISOString(),metrics:makeMetrics(cm.get(c.id),selected.filter(s=>s.campaignId===c.id).reduce((a,s)=>a+s.cost,0),confirmation(c.id,true),confirmation(c.id,true,true))}));
 const daily=new Map(dailyRows.map(r=>[r.date,{date:r.date,visits:Number(r.visits),clicks:Number(r.clicks),confirmed:0}]));
 for(const r of confirmedRows){const d=daily.get(r.date)||{date:r.date,visits:0,clicks:0,confirmed:0};d.confirmed+=Number(r.count);daily.set(r.date,d);}
 const completeDaily=[];for(let d=new Date(f.from+'T00:00:00Z');d<=new Date(f.to+'T00:00:00Z');d=new Date(+d+86400000)){const key=d.toISOString().slice(0,10);completeDaily.push(daily.get(key)||{date:key,visits:0,clicks:0,confirmed:0});}
 const confirmedByType:Record<string,number>={};for(const r of confirmedRows)confirmedByType[r.type]=(confirmedByType[r.type]||0)+Number(r.count);
 const q=quality[0];return {metrics:makeMetrics(total[0],selected.reduce((a,s)=>a+s.cost,0),confirmation(),confirmation(undefined,false,true)),unattributed:makeMetrics(map.get(null)),confirmedByType,daily:completeDaily,sources:sourceReport,campaigns:campaignReport,quality:{raw:Number(q?.raw||0),clean:Number(q?.clean||0),excluded:Number(q?.raw||0)-Number(q?.clean||0)},timezone:f.timezone};
}
export async function exportEvents(f:Filters){return rows(sql`SELECT e.id,e.created_at,e.type,s.code,e.campaign_id,e.session_id,e.network,e.clean,e.reasons,e.device,e.browser,e.is_test,e.attribution FROM events e LEFT JOIN sources s ON s.id=e.source_id WHERE ${eventWhere(f)} ORDER BY e.created_at LIMIT 100001`);}
export async function confirmedResults(f:Filters){return rows(sql`SELECT c.id,c.external_id AS "externalId",c.source_id AS "sourceId",s.name AS "sourceName",s.code AS "sourceCode",c.type,c.count,c.origin,c.occurred_at AS "occurredAt",c.is_test AS "isTest" FROM conversions c JOIN sources s ON s.id=c.source_id LEFT JOIN events ce ON ce.id=c.click_id WHERE ${conversionWhere(f)} ORDER BY c.occurred_at DESC LIMIT 150`);}
