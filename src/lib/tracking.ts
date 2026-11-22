import {randomUUID} from 'node:crypto';
import {and,eq,gt,sql} from 'drizzle-orm';
import {getDb} from './db';
import {aliases,sources,sessions,events,dedup,type Attribution} from './db/schema';
import {clientKey,cookie,hmac,sign,unsign,limit,HttpError} from './security';
import {normalizeUtm,validDestination} from './validation';
import {getSettings} from './settings';
import type {Network} from './contracts';
import {optionalAnalyticsEnabled} from './config';
export type StoredSource=typeof sources.$inferSelect;
type VisitToken={sid:string;sourceId:string|null};
export async function findSource(code:string){if(!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(code))return null;const [row]=await getDb().select({source:sources}).from(aliases).innerJoin(sources,eq(aliases.sourceId,sources.id)).where(eq(aliases.code,code));return row?.source||null;}
export async function resolveAttribution(headers:Headers,query:URLSearchParams,explicit?:StoredSource|null):Promise<Attribution>{
 const utm=normalizeUtm(query);let referrer='';try{const ref=new URL(headers.get('referer')||'');if(ref.origin!==new URL(process.env.APP_URL||'http://localhost:3000').origin) referrer=ref.hostname.slice(0,200);}catch{}
 if(explicit)return {kind:'source',sourceId:explicit.id,utm,referrer};
 if(Object.keys(utm).length){
  // Only administrator-configured UTM tuples can resolve to a source. Ambiguous tuples remain unattributed.
  const candidates=utm.source?await getDb().select().from(sources).where(eq(sources.utmSource,utm.source)):[];
  const matches=candidates.filter(s=>[['medium',s.utmMedium],['campaign',s.utmCampaign],['content',s.utmContent],['term',s.utmTerm]].every(([k,v])=>!v||utm[k]===v));
  return {kind:'utm',sourceId:matches.length===1?matches[0].id:null,utm,referrer};
 }
 return {kind:referrer?'referrer':'direct',sourceId:null,utm,referrer};
}
export function trafficQuality(headers:Headers){
 const ua=headers.get('user-agent')||'';const reasons:string[]=[];
 if(/bot|crawler|spider|slurp|headless|curl|wget|python|httpclient|go-http|node|undici|monitor|uptime/i.test(ua)||!ua)reasons.push('automation');
 if(/telegrambot|vkshare|facebookexternalhit|twitterbot|whatsapp|discordbot|slackbot|maxbot|preview/i.test(ua))reasons.push('link_preview');
 if(/prefetch|prerender/i.test((headers.get('purpose')||'')+' '+(headers.get('sec-purpose')||''))||headers.get('next-router-prefetch'))reasons.push('prefetch');
 if(headers.get('x-original-method')==='HEAD')reasons.push('head');
 if(!/text\/html/i.test(headers.get('accept')||'')&&headers.get('sec-fetch-mode')!=='navigate')reasons.push('non_browser_request');
 const device=/ipad|tablet/i.test(ua)?'tablet':/mobile|android|iphone/i.test(ua)?'mobile':'desktop';
 const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
 return {reasons,device,browser};
}
async function claim(key:string,seconds=5){const now=new Date();const [row]=await getDb().insert(dedup).values({key,expiresAt:new Date(now.getTime()+seconds*1000)}).onConflictDoUpdate({target:dedup.key,set:{expiresAt:new Date(now.getTime()+seconds*1000)},setWhere:sql`${dedup.expiresAt} <= ${now}`}).returning();return !!row;}
export async function recordEvent(input:{requestId:string;type:string;headers:Headers;attribution:Attribution;source?:StoredSource|null;sessionId?:string|null;network?:Network;id?:string;dedupIdentity?:string}){
 const q=trafficQuality(input.headers);
 const identity=input.dedupIdentity||hmac(clientKey(input.headers)+'|'+(input.headers.get('user-agent')||''));
 // Prefetch/preview requests must never reserve the human dedup slot.
 if(!q.reasons.length){const fresh=await claim(hmac(identity+'|'+input.type+'|'+(input.attribution.sourceId||input.attribution.kind)+'|'+(input.network||'')));if(!fresh)q.reasons.push('rapid_repeat');}
 const row={id:input.id||randomUUID(),requestId:input.requestId,type:input.type,sourceId:input.attribution.sourceId,campaignId:input.source?.campaignId||null,sessionId:input.sessionId||null,network:input.network||null,attribution:input.attribution,isTest:input.source?.isTest||false,clean:q.reasons.length===0,reasons:q.reasons,device:q.device,browser:q.browser};
 const [saved]=await getDb().insert(events).values(row).onConflictDoNothing({target:events.requestId}).returning();if(saved)return saved;const [existing]=await getDb().select().from(events).where(eq(events.requestId,input.requestId));return existing||null;
}
export async function obtainSession(headers:Headers,attribution:Attribution,entryToken?:string|null){
 const db=getDb();const transfer=unsign<VisitToken>(entryToken);
 const saved=optionalAnalyticsEnabled()&&cookie(headers,'motiv_consent')==='accepted'?unsign<VisitToken>(cookie(headers,'motiv_session')):null;
 const sid=transfer?.sid||saved?.sid;let current;
 if(sid&&/^[a-f0-9-]{36}$/.test(sid)){[current]=await db.select().from(sessions).where(and(eq(sessions.id,sid),gt(sessions.lastAt,new Date(Date.now()-1800000))));}
 const advertised=attribution.kind==='source'||attribution.kind==='utm';
 if(current){
  const effective=transfer && attribution.sourceId===current.lastSourceId && !Object.keys(attribution.utm).length ? current.lastAttribution : attribution;
  const changes={lastAt:new Date(),...(advertised?{lastSourceId:effective.sourceId,lastAttribution:effective}:{})};
  const [row]=await db.update(sessions).set(changes).where(eq(sessions.id,current.id)).returning();return row;
 }
 const [row]=await db.insert(sessions).values({id:randomUUID(),firstSourceId:attribution.sourceId,lastSourceId:attribution.sourceId,firstAttribution:attribution,lastAttribution:attribution}).returning();return row;
}
function trustedDedupSession(headers:Headers,sid:string){const saved=optionalAnalyticsEnabled()&&cookie(headers,'motiv_consent')==='accepted'?unsign<VisitToken>(cookie(headers,'motiv_session')):null;return saved?.sid===sid?sid:undefined;}
export async function sourceById(id:string|null){if(!id)return null;const [row]=await getDb().select().from(sources).where(eq(sources.id,id));return row||null;}
export async function trackEntry(headers:Headers,query:URLSearchParams,source:StoredSource){
 await limit('public:'+clientKey(headers),180,60);
 const attribution=await resolveAttribution(headers,query,source);const session=await obtainSession(headers,attribution);
 await recordEvent({requestId:randomUUID(),type:'incoming',headers,attribution,source,sessionId:session.id,dedupIdentity:trustedDedupSession(headers,session.id)});
 return sign({sid:session.id,sourceId:source.id,entry:true},86400);
}
export async function trackLanding(headers:Headers,query:URLSearchParams){
 await limit('public:'+clientKey(headers),180,60);
 const transfer=unsign<VisitToken & {entry?:boolean}>(query.get('entry'));
 const explicit=transfer?await sourceById(transfer.sourceId):null;
 const attribution=await resolveAttribution(headers,query,explicit);
 const session=await obtainSession(headers,attribution,query.get('entry'));
 const effective=session.lastAttribution;const source=await sourceById(effective.sourceId);
 const requestId=headers.get('x-motiv-request')||randomUUID();
 const dedupIdentity=trustedDedupSession(headers,session.id);
 if(!transfer?.entry)await recordEvent({requestId:requestId+':in',type:'incoming',headers,attribution:effective,source,sessionId:session.id,dedupIdentity});
 const view=await recordEvent({requestId:requestId+':view',type:'landing_view',headers,attribution:effective,source,sessionId:session.id,dedupIdentity});
 const sid=view?.sessionId||session.id,sourceId=view?.sourceId||effective.sourceId;
 return {token:sign({sid,sourceId},86400),sessionId:sid,sourceId};
}
function clickPayload(id:string){return 'c_'+Buffer.from(id.replaceAll('-',''),'hex').toString('base64url');}
export function decodeClickPayload(value:string){if(!/^c_[A-Za-z0-9_-]{22}$/.test(value))return null;const hex=Buffer.from(value.slice(2),'base64url').toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}
export async function trackOutbound(headers:Headers,network:Network,options:{code?:string;token?:string}){
 await limit('outbound:'+clientKey(headers),120,60);
 let source:StoredSource|null=null;let sessionId:string|null=null;let attribution:Attribution={kind:'direct',sourceId:null,utm:{},referrer:''};
 if(options.code){source=await findSource(options.code);if(!source)throw new HttpError(404,'Источник не найден');attribution={...attribution,kind:'source',sourceId:source.id};}
 else {
  const signed=unsign<VisitToken>(options.token);if(!signed)throw new HttpError(400,'Ссылка устарела. Вернитесь на главную страницу.');
  source=await sourceById(signed.sourceId);if(signed.sourceId&&!source)throw new HttpError(404,'Источник удалён. Вернитесь на главную страницу.');attribution={...attribution,kind:source?'source':'direct',sourceId:source?.id||null};
  const [session]=await getDb().select().from(sessions).where(and(eq(sessions.id,signed.sid),gt(sessions.lastAt,new Date(Date.now()-1800000))));
  if(session){sessionId=session.id;attribution=session.lastAttribution;source=await sourceById(attribution.sourceId);await getDb().update(sessions).set({lastAt:new Date()}).where(eq(sessions.id,session.id));}
 }
 const settings=await getSettings();let target=source?.links[network]||settings.links[network];
 if(!target)throw new HttpError(503,'Организатор ещё не добавил ссылку на эту площадку.');
 target=validDestination(target,network); // Validate again at read time, including direct DB edits.
 const clickId=randomUUID();const requestId=randomUUID();
 if(options.code)await recordEvent({requestId:requestId+':in',type:'incoming',headers,attribution,source,network});
 await recordEvent({requestId,type:options.code?'print_click':'social_click',headers,attribution,source,sessionId,network,id:clickId,dedupIdentity:sessionId||undefined});
 const mode=settings.linkModes[network];
 if(mode!=='plain'){
  const url=new URL(target);url.searchParams.set(network==='vk'?'ref':'start',mode==='click'?clickPayload(clickId):(source?.code||'direct'));
  if(network==='vk')url.searchParams.set('ref_source','motiv');target=url.toString();
 }
 return {target,clickId,sessionId,sourceId:source?.id||null};
}
