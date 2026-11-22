import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {migrate} from '../scripts/migrate';
import {seed} from '../scripts/seed';
import {getDb,closeDb} from '../src/lib/db';
import {events,sessions,dedup,rateLimits,sources} from '../src/lib/db/schema';
import {getReport,parseFilters} from '../src/lib/report';
import {getSettings,saveSettings} from '../src/lib/settings';
import {mutate} from '../src/lib/admin-service';
import {GET as vk,HEAD as vkHead} from '../src/app/vk/route';
import {GET as tg,HEAD as tgHead} from '../src/app/tg/route';
import {GET as max,HEAD as maxHead} from '../src/app/max/route';

process.env.DATABASE_URL='pglite://memory';process.env.APP_URL='https://rabota.my';process.env.AUTH_SECRET='direct-social-tests-secret-at-least-32-characters';process.env.TRUST_PROXY='true';
const cases=[
 {path:'/vk',get:vk,head:vkHead,target:'https://vk.ru/alekseevich143'},
 {path:'/tg',get:tg,head:tgHead,target:'https://t.me/alekseevich_job'},
 {path:'/max',get:max,head:maxHead,target:'https://max.ru/u/f9LHodD0cOIhdWgnjYqFrMRhiGpvLv-tvsh11QEkyXB5PGk4bTvc6XxyO1U'},
];
function request(path:string,method='GET',userAgent='Mozilla/5.0 Chrome/132.0'){return new Request('https://rabota.my'+path,{method,headers:{'user-agent':userAgent,accept:'text/html','sec-fetch-mode':'navigate','x-forwarded-for':'192.0.2.55'}});}
before(async()=>{await migrate();await seed();await mutate('sources',{name:'Офлайн / Баннеры',code:'offline_banners',printCode:'banners',category:'offline',platform:'Баннеры'},'test');});after(closeDb);
beforeEach(async()=>{await getDb().delete(events);await getDb().delete(sessions);await getDb().delete(dedup);await getDb().delete(rateLimits);});

test('all three aliases redirect to exact supplied URLs and count direct clicks without landing visits',async()=>{
 for(const item of cases){const response=await item.get(request(item.path));assert.equal(response.status,302);assert.equal(response.headers.get('location'),item.target);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);}
 const report=await getReport(await parseFilters(new URLSearchParams()));
 assert.equal(report.metrics.incoming,3);assert.equal(report.metrics.clicks,3);assert.equal(report.metrics.visits,0);assert.equal(report.metrics.sessions,0);assert.equal(report.metrics.convertedSessions,0);
 assert.equal((await getDb().select().from(sessions)).length,0);
 const banner=report.sources.find(source=>source.code==='offline_banners');assert.ok(banner);
 assert.equal(banner.isTest,false);assert.equal(banner.metrics.incoming,3);assert.equal(banner.metrics.clicks,3);
 assert.deepEqual(banner.urls,{main:'https://rabota.my/r/offline_banners',vk:'https://rabota.my/vk',telegram:'https://rabota.my/tg',max:'https://rabota.my/max'});
 assert.deepEqual([banner.metrics.vk,banner.metrics.telegram,banner.metrics.max],[1,1,1]);
 assert.equal(report.unattributed.clicks,0);
});

test('query parameters and global bot settings cannot change alias destinations',async()=>{
 const settings=await getSettings();await saveSettings({...settings,links:{vk:'https://vk.com/another',telegram:'https://t.me/another',max:'https://max.ru/another'},linkModes:{vk:'click',telegram:'source',max:'click'}});
 for(const item of cases){const response=await item.get(request(item.path+'?url=https://example.org&redirect=https://example.org&start=other&ref=other&utm_source=unknown'));assert.equal(response.status,302);assert.equal(response.headers.get('location'),item.target);}
});

test('HEAD requests redirect without creating analytics events',async()=>{
 for(const item of cases){const response=await item.head(request(item.path,'HEAD'));assert.equal(response.status,302);assert.equal(response.headers.get('location'),item.target);assert.equal(await response.text(),'');}
 assert.equal((await getDb().select().from(events)).length,0);
});

test('aliases retain bot filtering and repeats while the banner source takes priority over UTM',async()=>{
 await tg(request('/tg'));await tg(request('/tg'));await max(request('/max','GET','TelegramBot'));
 let report=await getReport(await parseFilters(new URLSearchParams()));assert.equal(report.metrics.clicks,1);assert.equal(report.quality.raw,6);assert.equal(report.quality.clean,2);
 const source=(await getDb().select().from(sources))[0];await getDb().update(sources).set({utmSource:'direct-alias-test'}).where(eq(sources.id,source.id));
 const count=(await getDb().select().from(sources)).length;
 await vk(request('/vk?utm_source=direct-alias-test'));
 report=await getReport(await parseFilters(new URLSearchParams()));
 const banner=report.sources.find(source=>source.code==='offline_banners')!;
 assert.equal(banner.metrics.vk,1);assert.equal(banner.metrics.visits,0);assert.equal((await getDb().select().from(sources)).length,count);
 const click=(await getDb().select().from(events)).find(event=>event.network==='vk'&&event.type==='print_click')!;
 assert.equal(click.sourceId,banner.id);assert.equal(click.attribution.kind,'source');assert.equal(click.attribution.utm.source,'direct-alias-test');
});

test('banner attribution survives renaming and remains separate from landing conversion',async()=>{
 const banner=(await getDb().select().from(sources).where(eq(sources.code,'offline_banners')))[0];
 await getDb().update(sources).set({name:'Баннеры — новое название'}).where(eq(sources.id,banner.id));
 try{
  assert.equal((await max(request('/max'))).status,302);
  const report=await getReport(await parseFilters(new URLSearchParams({sourceId:banner.id})));
  assert.equal(report.sources[0].name,'Баннеры — новое название');assert.equal(report.metrics.max,1);assert.equal(report.metrics.visits,0);assert.equal(report.metrics.convertedSessions,0);
 }finally{await getDb().update(sources).set({name:banner.name}).where(eq(sources.id,banner.id));}
});

test('direct aliases share the outbound request limit',async()=>{
 for(let i=0;i<120;i++)assert.equal((await vkHead(request('/vk','HEAD'))).status,302);
 assert.equal((await maxHead(request('/max','HEAD'))).status,429);
 assert.equal((await getDb().select().from(events)).length,0);
});
