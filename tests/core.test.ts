import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parse as parseCsv} from 'csv-parse/sync';
import {unzipSync,strFromU8} from 'fflate';
import {eq,sql} from 'drizzle-orm';
import {migrate} from '../scripts/migrate';
import {seed} from '../scripts/seed';
import {getDb,closeDb} from '../src/lib/db';
import {sources,campaigns,events,sessions,conversions,dedup,rateLimits,admins,adminSessions} from '../src/lib/db/schema';
import {mutate,bootstrap} from '../src/lib/admin-service';
import {getSettings} from '../src/lib/settings';
import {findSource,resolveAttribution,trackEntry,trackLanding,trackOutbound,trafficQuality,obtainSession,decodeClickPayload} from '../src/lib/tracking';
import {parseFilters,getReport} from '../src/lib/report';
import {validDestination,normalizeUtm} from '../src/lib/validation';
import {hashPassword,verifyPassword,sign,unsign,requireAdmin,limit,apiError} from '../src/lib/security';
import {csvString,csvExport,qrExport} from '../src/lib/exports';
import {addConversion,importConversions} from '../src/lib/conversions';
import {cleanup} from '../src/lib/retention';
import {POST as login} from '../src/app/api/auth/login/route';
import {POST as consent} from '../src/app/api/consent/route';
import {POST as postback} from '../src/app/api/postback/route';
import {GET as adminGet,POST as adminPost} from '../src/app/api/admin/[section]/route';
import {GET as printGet,HEAD as printHead} from '../src/app/[short]/[code]/route';
import {GET as sourceGet} from '../src/app/r/[code]/route';
import {GET as socialGet} from '../src/app/go/[network]/route';
import {NextRequest} from 'next/server';
import {proxy} from '../src/proxy';
process.env.DATABASE_URL='pglite://memory';Object.assign(process.env,{NODE_ENV:'test'});process.env.APP_URL='http://localhost:3000';process.env.AUTH_SECRET='test-auth-secret-not-for-deployment-123456';process.env.POSTBACK_SECRET='test-postback-secret-not-for-deployment-123456';process.env.TRUST_PROXY='true';process.env.OPTIONAL_ANALYTICS_ENABLED='true';
let ip=0;
function browser(extra:Record<string,string>={}){return new Headers({'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18 Mobile/15 Safari/604.1','accept':'text/html','sec-fetch-mode':'navigate','x-forwarded-for':'192.0.2.'+(++ip),'origin':'http://localhost:3000',...extra});}
function request(path:string,headers:Headers,body?:unknown){const h=new Headers(headers);if(body!==undefined)h.set('Content-Type','application/json');return new Request('http://localhost:3000'+path,{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body)});}
async function report(mode='test',extra:Record<string,string>={}){return getReport(await parseFilters(new URLSearchParams({dataMode:mode,...extra})));}
async function clearTraffic(){await getDb().delete(conversions);await getDb().delete(events);await getDb().delete(sessions);await getDb().delete(dedup);await getDb().delete(rateLimits);}
before(async()=>{await migrate();await seed();await mutate('links',{links:{vk:'https://vk.com/motiv_test',telegram:'https://t.me/motiv_test',max:'https://max.ru/motiv_test'}},'test');});
after(closeDb);

test('cookie-free mode ignores legacy cookies and keeps signed source-to-click attribution',async()=>{
 process.env.OPTIONAL_ANALYTICS_ENABLED='false';
 try{
  const source=(await findSource('spb01'))!,h=browser();
  const entry=await trackEntry(h,new URLSearchParams(),source);
  const visit=await trackLanding(h,new URLSearchParams({entry}));
  h.set('cookie',`motiv_consent=accepted; motiv_session=${sign({sid:visit.sessionId,sourceId:source.id})}`);
  const independent=await obtainSession(h,{kind:'direct',sourceId:null,utm:{},referrer:''});
  assert.notEqual(independent.id,visit.sessionId);
  const click=await trackOutbound(h,'vk',{token:visit.token});
  assert.equal(click.sourceId,source.id);assert.equal(click.sessionId,visit.sessionId);
  const response=await consent(request('/api/consent',h,{analytics:true,token:visit.token}));
  assert.equal(response.status,410);
  const cookies=response.headers.getSetCookie();assert.equal(cookies.length,2);
  for(const value of cookies)assert.match(value,/Max-Age=0/);
  assert.ok(!cookies.some(value=>value.includes('=accepted')));
 }finally{process.env.OPTIONAL_ANALYTICS_ENABLED='true';await clearTraffic();}
});

test('cookie-free landing sends no visitor cookie and expires only legacy analytics cookies',()=>{
 process.env.OPTIONAL_ANALYTICS_ENABLED='false';
 try{
  const fresh=proxy(new NextRequest('http://localhost:3000/'));assert.equal(fresh.headers.get('set-cookie'),null);
  const existing=proxy(new NextRequest('http://localhost:3000/',{headers:{cookie:'motiv_consent=accepted; motiv_session=legacy; motiv_admin=owner'}}));
  const expired=existing.headers.getSetCookie();assert.equal(expired.length,2);
  for(const cookie of expired)assert.match(cookie,/Max-Age=0/);
  assert.ok(expired.some(value=>value.startsWith('motiv_session=')));
  assert.ok(expired.some(value=>value.startsWith('motiv_consent=')));
  assert.ok(!expired.some(value=>value.startsWith('motiv_admin=')));
 }finally{process.env.OPTIONAL_ANALYTICS_ENABLED='true';}
});

test('PostgreSQL migration is repeatable, seed is idempotent and creates no fake events',async()=>{await migrate();await seed();assert.equal((await getDb().select().from(sources)).length,4);assert.equal((await getDb().select().from(events)).length,0);const r=await report();assert.equal(r.sources.length,4);assert.equal(r.metrics.visits,0);assert.equal(r.metrics.costPerLead,null);});

test('scrypt, signed tokens, admin authentication, CSRF and login limiting',async()=>{
 const pass='valid-local-test-password';const hash=await hashPassword(pass);assert.notEqual(hash,await hashPassword(pass));assert.equal(await verifyPassword(pass,hash),true);assert.equal(await verifyPassword('wrong',hash),false);assert.equal(unsign(sign({sid:'sample'}))!==null,true);assert.equal(unsign(sign({sid:'sample'})+'x'),null);
 await getDb().insert(admins).values({email:'admin@example.test',passwordHash:hash});const h=browser();let res=await login(request('/api/auth/login',h,{email:'admin@example.test',password:pass}));assert.equal(res.status,200);const setCookie=res.headers.get('set-cookie')!;assert.match(setCookie,/HttpOnly/);const authHeaders=new Headers(h);authHeaders.set('cookie',setCookie.split(';')[0]);const user=await requireAdmin(authHeaders);assert.equal(user.email,'admin@example.test');
 res=await adminPost(request('/api/admin/campaigns',authHeaders,{name:'CSRF attempt'}),{params:Promise.resolve({section:'campaigns'})});assert.equal(res.status,403);authHeaders.set('x-csrf-token',user.csrf);res=await adminPost(request('/api/admin/campaigns',authHeaders,{name:'Рабочая кампания',category:'online',budget:500,status:'active'}),{params:Promise.resolve({section:'campaigns'})});assert.equal(res.status,200);
 const foreign=new Headers(authHeaders);foreign.set('origin','https://evil.test');res=await adminPost(request('/api/admin/campaigns',foreign,{name:'foreign'}),{params:Promise.resolve({section:'campaigns'})});assert.equal(res.status,403);
 for(let i=0;i<5;i++)res=await login(request('/api/auth/login',h,{email:'admin@example.test',password:'wrong'}));assert.equal(res.status,429);assert.equal((await adminGet(request('/api/admin/bootstrap',new Headers()),{params:Promise.resolve({section:'bootstrap'})})).status,401);
});

test('campaign/source CRUD, alias namespace and immutable printed URLs',async()=>{
 const campaign=await mutate('campaigns',{name:'Новая кампания',category:'online',budget:1000},'test') as {id:string};
 const s=await mutate('sources',{name:'Рабочий источник',code:'live01',printCode:'l01',campaignId:campaign.id,category:'online',platform:'VK',cost:500,utmSource:' VK ',utmCampaign:'launch'},'test') as {id:string};
 assert.equal((await findSource('l01'))?.id,s.id);assert.equal((await findSource('live01'))?.utmSource,'vk');
 await assert.rejects(()=>mutate('sources',{name:'Collision',code:'l01',printCode:'new01',category:'online',platform:'VK'},'test'));
 const old=(await findSource('live01'))!;await assert.rejects(()=>mutate('sources',{...old,id:s.id,code:'changed'},'test'),/постоянны/);await assert.rejects(()=>mutate('sources',{...old,id:s.id,isTest:true},'test'),/тип тестовых/);
 await mutate('sources',{...old,id:s.id,name:'Переименованный источник'},'test');assert.equal((await findSource('l01'))?.name,'Переименованный источник');
});

test('attribution priority: explicit source > configured UTM > referrer > direct; arbitrary UTM never creates sources',async()=>{
 const h=browser({referer:'https://search.example.test/path?private=1'});const spb=(await findSource('spb01'))!;
 const explicit=await resolveAttribution(h,new URLSearchParams('utm_source=VK&utm_campaign=launch'),spb);assert.equal(explicit.sourceId,spb.id);
 const utm=await resolveAttribution(h,new URLSearchParams('utm_source=%20VK%20&utm_campaign=launch'));assert.equal(utm.sourceId,(await findSource('live01'))?.id);
 const count=(await getDb().select().from(sources)).length;const unknown=await resolveAttribution(h,new URLSearchParams('utm_source=anything&utM_other=test'));assert.equal(unknown.kind,'utm');assert.equal(unknown.sourceId,null);assert.equal((await getDb().select().from(sources)).length,count);
 assert.equal((await resolveAttribution(h,new URLSearchParams())).referrer,'search.example.test');assert.equal((await resolveAttribution(browser(),new URLSearchParams())).kind,'direct');assert.deepEqual(normalizeUtm(new URLSearchParams('utm_source=%00VK%0a&utm_medium=QR')), {source:'vk',medium:'qr'});
});

test('source entry and three server-side social routes count one converted landing session',async()=>{
 await clearTraffic();const h=browser();const res=await sourceGet(request('/r/spb01?utm_medium=qr',h),{params:Promise.resolve({code:'spb01'})});assert.equal(res.status,302);assert.equal(res.headers.has('set-cookie'),false);const entry=new URL(res.headers.get('location')!).searchParams.get('entry')!;
 const visit=await trackLanding(h,new URLSearchParams({entry}));
 for(const network of ['vk','telegram','max']){const redirect=await socialGet(request('/go/'+network+'?token='+visit.token,h),{params:Promise.resolve({network})});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('cache-control'),'no-store');}
 const r=await report();assert.equal(r.metrics.incoming,1);assert.equal(r.metrics.visits,1);assert.equal(r.metrics.sessions,1);assert.equal(r.metrics.clicks,3);assert.equal(r.metrics.convertedSessions,1);assert.equal(r.metrics.conversion,100);assert.deepEqual([r.metrics.vk,r.metrics.telegram,r.metrics.max],[1,1,1]);assert.equal((await getDb().select().from(sessions))[0].lastAttribution.utm.medium,'qr');assert.equal((await report('live')).metrics.visits,0);
});

test('all four demonstration sources remain distinct; print links never create landing visits',async()=>{
 await clearTraffic();for(const code of ['spb01','spb02','twitch01','vkpub01']){const h=browser(),s=(await findSource(code))!;const entry=await trackEntry(h,new URLSearchParams(),s),visit=await trackLanding(h,new URLSearchParams({entry}));await trackOutbound(h,'telegram',{token:visit.token});}
 let r=await report();assert.equal(r.metrics.visits,4);assert.equal(r.sources.filter(s=>s.metrics.visits===1).length,4);
 await clearTraffic();for(const short of ['v','t','m']){const res=await printGet(request('/'+short+'/p02',browser()),{params:Promise.resolve({short,code:'p02'})});assert.equal(res.status,302);}
 r=await report();assert.equal(r.metrics.incoming,3);assert.equal(r.metrics.visits,0);assert.equal(r.metrics.sessions,0);assert.equal(r.metrics.clicks,3);assert.equal(r.metrics.convertedSessions,0);assert.equal((await getDb().select().from(events)).every(e=>e.sessionId===null),true);assert.equal((await printHead()).status,204);assert.equal((await getDb().select().from(events)).length,6);
});

test('bots/previews/rapid repeats retained raw but excluded; fake session cookie cannot bypass dedup',async()=>{
 await clearTraffic();const h=browser({'cookie':'motiv_session=garbage; motiv_consent=accepted'});for(let i=0;i<3;i++)await trackLanding(h,new URLSearchParams());let r=await report('live');assert.equal(r.metrics.visits,1);assert.equal(r.quality.excluded,4);assert.equal((await report('live',{quality:'raw'})).metrics.visits,3);
 const preview=browser({'user-agent':'TelegramBot (like TwitterBot)'});await trackLanding(preview,new URLSearchParams());const scripted=browser({'user-agent':'curl/8.0'});await trackLanding(scripted,new URLSearchParams());r=await report('live');assert.equal(r.metrics.visits,1);assert.equal(r.quality.raw,10);assert.equal(trafficQuality(preview).reasons.includes('link_preview'),true);assert.equal(trafficQuality(browser({'sec-purpose':'prefetch'})).reasons.includes('prefetch'),true);
 const signed=await trackLanding(browser(),new URLSearchParams());const clickHeaders=browser();await trackOutbound(clickHeaders,'vk',{token:signed.token});await trackOutbound(clickHeaders,'vk',{token:signed.token});const repeats=(await getDb().select().from(events)).filter(e=>e.type==='social_click');assert.equal(repeats.filter(e=>e.clean).length,1);assert.equal(repeats.filter(e=>!e.clean).length,1);
});

test('first-touch remains, last advertising touch changes, session expires after 30 idle minutes',async()=>{
 await clearTraffic();const h=browser(),first=(await findSource('spb01'))!,last=(await findSource('twitch01'))!;const a=await resolveAttribution(h,new URLSearchParams(),first);const s=await obtainSession(h,a);h.set('cookie','motiv_consent=accepted; motiv_session='+sign({sid:s.id,sourceId:first.id}));await obtainSession(h,await resolveAttribution(h,new URLSearchParams(),last));let [saved]=await getDb().select().from(sessions).where(eq(sessions.id,s.id));assert.equal(saved.firstSourceId,first.id);assert.equal(saved.lastSourceId,last.id);await obtainSession(h,await resolveAttribution(h,new URLSearchParams()));[saved]=await getDb().select().from(sessions).where(eq(sessions.id,s.id));assert.equal(saved.lastSourceId,last.id);
 await getDb().update(sessions).set({lastAt:new Date(Date.now()-31*60000)}).where(eq(sessions.id,s.id));assert.notEqual((await obtainSession(h,a)).id,s.id);
 const token=sign({sid:s.id,sourceId:first.id});const res=await consent(request('/api/consent',browser(),{analytics:true,token}));assert.equal(res.status,200);assert.match(res.headers.get('set-cookie')!,/motiv_session=/);assert.match(res.headers.get('set-cookie')!,/HttpOnly/);const denied=await consent(request('/api/consent',browser(),{analytics:false,token}));assert.match(denied.headers.get('set-cookie')!,/motiv_consent=declined/);
});

test('destinations use strict HTTPS host validation, source override, unchanged QR on link change',async()=>{
 assert.equal(validDestination('https://vk.ru/alekseevich143','vk'),'https://vk.ru/alekseevich143');
 for(const url of ['https://vk.ru.evil.test/a','https://vk.ru/away.php?to=https://evil.test','https://evil.vk.ru/a'])assert.throws(()=>validDestination(url,'vk'));
 for(const url of ['javascript:alert(1)','https://vk.com.evil.test/a','https://vk.com@evil.test/a','https://vk.com:444/a','https://vk.com/away.php?to=https://evil.test'])assert.throws(()=>validDestination(url,'vk'));
 const s=(await findSource('spb01'))!,url='http://localhost:3000/r/spb01';const before=await (await qrExport(new URLSearchParams({sourceId:s.id,format:'svg'}))).text();assert.ok(before.includes('<svg'));await mutate('links',{links:{vk:'https://vk.com/updated',telegram:'https://t.me/updated',max:'https://max.ru/updated'}},'test');const after=await (await qrExport(new URLSearchParams({sourceId:s.id,format:'svg'}))).text();assert.equal(after,before);assert.equal((await trackOutbound(browser(),'vk',{code:'p01'})).target,'https://vk.com/updated');await mutate('links',{sourceId:s.id,links:{vk:'https://vk.com/source_override',telegram:'',max:''}},'test');assert.equal((await trackOutbound(browser(),'vk',{code:'spb01'})).target,'https://vk.com/source_override');assert.equal((await sourceGet(request('/r/unknown',browser()),{params:Promise.resolve({code:'unknown'})})).status,404);
 assert.equal((await printGet(request('/v/unknown',browser()),{params:Promise.resolve({short:'v',code:'unknown'})})).status,404);assert.equal((await socialGet(request('/go/vk?token=invalid',browser()),{params:Promise.resolve({network:'vk'})})).status,400);
});

test('unconfigured social destination rejects clicks without recording an event; source override remains usable',async()=>{
 const settings=await getSettings(),s=(await findSource('spb02'))!;
 await mutate('links',{links:{...settings.links,max:''}},'test');
 const before=(await getDb().select().from(events)).length;
 await assert.rejects(()=>trackOutbound(browser(),'max',{code:s.code}),/ещё не добавил/);
 assert.equal((await getDb().select().from(events)).length,before);
 await mutate('links',{sourceId:s.id,links:{...s.links,max:'https://max.ru/source_override'}},'test');
 assert.equal((await trackOutbound(browser(),'max',{code:s.code})).target,'https://max.ru/source_override');
 await mutate('links',{sourceId:s.id,links:s.links},'test');
 await mutate('links',{links:settings.links},'test');
});

test('QR PNG/SVG/ZIP and A5/A6 print dimensions',async()=>{
 const s=(await findSource('spb01'))!,base={sourceId:s.id,size:'1024'};const png=Buffer.from(await (await qrExport(new URLSearchParams({...base,format:'png'}))).arrayBuffer());assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1024);const svg=await (await qrExport(new URLSearchParams({...base,format:'svg'}))).text();assert.match(svg,/fill="#ffffff"/);for(const [format,width]of [['a5','148mm'],['a6','105mm']])assert.match(await (await qrExport(new URLSearchParams({...base,format}))).text(),new RegExp(width));const zip=Buffer.from(await(await qrExport(new URLSearchParams({ids:s.id+','+(await findSource('spb02'))!.id,format:'zip'}))).arrayBuffer());assert.equal(zip.subarray(0,2).toString(),'PK');
});

test('print templates include the same branded QR as standalone SVG downloads',async()=>{
 const source=(await findSource('spb01'))!;
 const qr=await (await qrExport(new URLSearchParams({sourceId:source.id,format:'svg',size:'1024'}))).text();
 const matrix=qr.match(/<svg[^>]*>([\s\S]*)<\/svg>/)![1];
 for(const format of ['a5','a6']){
  const print=await(await qrExport(new URLSearchParams({sourceId:source.id,format}))).text();
  assert.ok(print.includes('aria-label="IziWork"'));
  assert.ok(print.includes('data:image/png;base64,'),'print artwork must be self-contained');
  assert.ok(print.includes(matrix),'print and standalone downloads must use the same branded QR');
  assert.ok(print.includes('id="iziwork-qr-brand"'));
  assert.ok(!print.includes('Мотив'));
 }
});

test('bulk downloads brand every source and preserve the matching table',async()=>{
 const first=(await findSource('spb01'))!,second=(await findSource('spb02'))!;
 const response=await qrExport(new URLSearchParams({ids:first.id+','+second.id,format:'zip',size:'512'}));
 const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
 for(const code of ['spb01','spb02']){
  assert.ok(strFromU8(files[code+'.svg']).includes('id="iziwork-qr-brand"'));
  assert.equal(Buffer.from(files[code+'.png']).readUInt32BE(16),512);
 }
 assert.ok(strFromU8(files['sources.csv']).includes('http://localhost:3000/r/spb01'));
 assert.ok(strFromU8(files['sources.csv']).includes('http://localhost:3000/r/spb02'));
});

test('filtered reports/CSV, formula injection protection and unattributed metrics',async()=>{
 await clearTraffic();const h=browser(),s=(await findSource('spb01'))!;const token=await trackEntry(h,new URLSearchParams(),s);const visit=await trackLanding(h,new URLSearchParams({entry:token}));await trackOutbound(h,'telegram',{token:visit.token});await trackLanding(browser(),new URLSearchParams());const f=await parseFilters(new URLSearchParams({dataMode:'test',sourceId:s.id,device:'mobile'}));assert.equal((await getReport(f)).metrics.visits,1);const csv=await(await csvExport(new URLSearchParams({kind:'events',dataMode:'test',sourceId:s.id}))).text();assert.ok(csv.includes('spb01'));assert.ok(!csv.includes('spb02'));assert.ok(csvString([{name:'=SUM(1,2)',text:'"quoted"'}]).includes("'=SUM"));const r=await report('live');assert.equal(r.unattributed.visits,1);await assert.rejects(()=>parseFilters(new URLSearchParams({from:'2026-10-24',to:'2026-10-01'})));await assert.rejects(()=>parseFilters(new URLSearchParams({sourceId:'gggggggg-gggg-gggg-gggg-gggggggggggg'})));
});

test('postback auth, compact click attribution, idempotency and campaign snapshot',async()=>{
 await clearTraffic();const s=(await findSource('spb01'))!;await mutate('links',{links:(await getSettings()).links,linkModes:{vk:'source',telegram:'click',max:'click'}},'test');const click=await trackOutbound(browser(),'telegram',{code:'spb01'});const payload=new URL(click.target).searchParams.get('start')!;assert.equal(decodeClickPayload(payload),click.clickId);assert.ok(payload.length<=64);const initial=(await getDb().select().from(events).where(eq(events.id,click.clickId)))[0].campaignId;const [newCampaign]=await getDb().insert(campaigns).values({name:'Новая после клика'}).returning();await getDb().update(sources).set({campaignId:newCampaign.id}).where(eq(sources.id,s.id));
 const h=browser();const body={externalId:'external-1',attribution:payload,type:'lead',count:1};assert.equal((await postback(request('/api/postback',h,body))).status,401);h.set('authorization','Bearer '+process.env.POSTBACK_SECRET);let res=await postback(request('/api/postback',h,body));assert.deepEqual(await res.json(),{inserted:true,duplicate:false});res=await postback(request('/api/postback',h,body));assert.deepEqual(await res.json(),{inserted:false,duplicate:true});const [c]=await getDb().select().from(conversions);assert.equal(c.campaignId,initial);assert.equal(c.sourceId,s.id);assert.equal((await report()).metrics.confirmed,1);await getDb().update(sources).set({campaignId:initial}).where(eq(sources.id,s.id));
});

test('manual results and CSV imports validated atomically and deduplicated',async()=>{
 await clearTraffic();const id=(await findSource('spb02'))!.id;await addConversion({sourceId:id,externalId:'manual-proof',type:'subscribed',count:2},'manual','test');const csv='source_code,type,count,external_id,occurred_at\nspb02,lead,3,batch-1,\nspb02,bot_started,4,batch-2,';assert.deepEqual(await importConversions(csv,'test'),{inserted:2,duplicates:0});assert.deepEqual(await importConversions(csv,'test'),{inserted:0,duplicates:2});const count=(await getDb().select().from(conversions)).length;await assert.rejects(()=>importConversions('source_code,type,count,external_id\nspb02,lead,1,new-batch\nmissing,lead,1,bad','test'));assert.equal((await getDb().select().from(conversions)).length,count);const r=await report();assert.equal(r.metrics.confirmed,9);assert.equal(r.confirmedByType.lead,3);assert.equal(r.metrics.costPerLead,0);
});

test('timezone boundaries use Europe/Moscow and device filters never invent aggregate attribution',async()=>{
 await clearTraffic();const h=browser(),s=(await findSource('spb01'))!;const visit=await trackLanding(h,new URLSearchParams({entry:await trackEntry(h,new URLSearchParams(),s)}));await getDb().update(events).set({createdAt:new Date('2026-10-23T21:05:00Z')});const r=await report('test',{from:'2026-10-24',to:'2026-10-24',timezone:'Europe/Moscow'});assert.equal(r.metrics.visits,1);assert.equal(r.daily[0].date,'2026-10-24');assert.equal((await report('test',{from:'2026-10-23',to:'2026-10-23',timezone:'Europe/Moscow'})).metrics.visits,0);
});

test('retention preserves retained sessions/CVR and deletes expired analytics only',async()=>{
 await clearTraffic();const h=browser(),s=(await findSource('spb01'))!;const visit=await trackLanding(h,new URLSearchParams({entry:await trackEntry(h,new URLSearchParams(),s)}));await trackOutbound(h,'vk',{token:visit.token});const old=new Date(Date.now()-2*86400000);await getDb().update(events).set({createdAt:old});await getDb().update(sessions).set({lastAt:old});const before=await report();assert.equal(before.metrics.sessions,1);await cleanup();const after=await report();assert.equal(after.metrics.sessions,before.metrics.sessions);assert.equal(after.metrics.conversion,before.metrics.conversion);await getDb().update(events).set({createdAt:new Date(Date.now()-100*86400000)});await getDb().update(sessions).set({lastAt:new Date(Date.now()-100*86400000)});const counts=await cleanup();assert.ok(counts.events>0);assert.equal((await getDb().select().from(events)).length,0);assert.equal((await getDb().select().from(sessions)).length,0);
});

test('distributed database rate limiter rejects the next request',async()=>{await limit('test-key',2,60);await limit('test-key',2,60);await assert.rejects(()=>limit('test-key',2,60),/Слишком много/);});

test('archived sources keep working and validation failures are reported as 400/409',async()=>{
 await clearTraffic();const old=(await findSource('spb01'))!;await mutate('sources',{...old,active:false},'test');const s=(await findSource('spb01'))!,h=browser();const entry=await trackEntry(h,new URLSearchParams(),s);const page=await trackLanding(h,new URLSearchParams({entry}));await trackOutbound(h,'vk',{token:page.token});assert.equal((await report()).metrics.visits,1);assert.equal((await report()).metrics.clicks,1);await mutate('sources',old,'test');
 await assert.rejects(()=>parseFilters(new URLSearchParams({from:'2026-02-31',to:'2026-03-10'})));await assert.rejects(()=>mutate('conversions',null,'test'));
 const auth=browser({authorization:'Bearer '+process.env.POSTBACK_SECRET});assert.equal((await postback(request('/api/postback',auth,null))).status,400);
 try{await mutate('sources',{name:'Collision',code:'spb01',printCode:'conflict01',category:'offline',platform:'Расклейка'},'test');assert.fail('duplicate must fail');}catch(e){assert.equal(apiError(e).status,409);}
});

test('overall CSV includes direct traffic and distinct totals; empty filtered exports keep headers',async()=>{
 await clearTraffic();await trackLanding(browser(),new URLSearchParams());const data=parseCsv(await(await csvExport(new URLSearchParams({kind:'stats',dataMode:'live'}))).text(),{columns:true,bom:true}) as Record<string,string>[];assert.equal(data.length,1);assert.equal(Number(data[0].visits),1);assert.equal(Number(data[0].sessions),1);assert.equal(data[0].timezone,'Europe/Moscow');const empty=await(await csvExport(new URLSearchParams({kind:'events',dataMode:'test'}))).text();assert.ok(empty.includes('session_id'));assert.equal(parseCsv(empty,{columns:true,bom:true}).length,0);
});
