import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {migrate} from '../scripts/migrate';
import {getDb,closeDb} from '../src/lib/db';
import {admins,adminSessions,campaigns,sources,sessions,events,conversions,aliases,linkHistory,audit} from '../src/lib/db/schema';
import {mutate} from '../src/lib/admin-service';
import {permanentDelete} from '../src/lib/permanent-delete';
import {findSource,trackEntry,trackLanding,trackOutbound} from '../src/lib/tracking';
import {addConversion} from '../src/lib/conversions';
import {getReport,parseFilters} from '../src/lib/report';
import {sign} from '../src/lib/security';
import {DELETE as deleteEndpoint} from '../src/app/api/admin/[section]/route';
import {GET as sourceRoute} from '../src/app/r/[code]/route';
import type {Source} from '../src/lib/contracts';

process.env.DATABASE_URL='pglite://memory';
Object.assign(process.env,{NODE_ENV:'test',APP_URL:'http://localhost:3000',AUTH_SECRET:'permanent-deletion-local-test-secret-1234',TRUST_PROXY:'true',OPTIONAL_ANALYTICS_ENABLED:'true'});
let address=0;
const browser=()=>new Headers({'user-agent':'Mozilla/5.0 Chrome/130.0 Mobile','accept':'text/html','sec-fetch-mode':'navigate','x-forwarded-for':'198.51.100.'+(++address)});
const makeCampaign=async(name:string)=>await mutate('campaigns',{name,category:'online'},'test') as typeof campaigns.$inferSelect;
const makeSource=async(code:string,campaignId?:string)=>await mutate('sources',{name:code,code,printCode:code+'_p',category:'online',campaignId,platform:'VK',isTest:true},'test') as Source;
async function visit(code:string,headers=browser()){
 const source=(await findSource(code))!;const entry=await trackEntry(headers,new URLSearchParams(),source);
 const landing=await trackLanding(headers,new URLSearchParams({entry}));const click=await trackOutbound(headers,'vk',{token:landing.token});
 return {...landing,clickId:click.clickId,headers};
}
before(async()=>{await migrate();await mutate('links',{links:{vk:'https://vk.ru/delete_test',telegram:'https://t.me/delete_test',max:'https://max.ru/delete_test'}},'test');});
after(closeDb);

test('source purge deletes its data and repairs shared sessions without losing other sources',async()=>{
 const campaign=await makeCampaign('Keep campaign'),a=await makeSource('purge_a',campaign.id),b=await makeSource('keep_b',campaign.id);
 const alone=await visit(a.code);await addConversion({clickId:alone.clickId,externalId:'alone',type:'lead'},'manual','test');
 await mutate('links',{sourceId:a.id,links:{vk:'https://vk.ru/new_delete_test',telegram:'',max:''}},'test');
 const shared=await visit(a.code);shared.headers.set('cookie',`motiv_consent=accepted; motiv_session=${sign({sid:shared.sessionId,sourceId:a.id})}`);
 const kept=await visit(b.code,shared.headers);assert.equal(kept.sessionId,shared.sessionId);
 await addConversion({clickId:kept.clickId,externalId:'keep',type:'lead'},'manual','test');
 const removed=await permanentDelete('sources',{id:a.id,confirmation:a.code},'test');assert.equal(removed.removed.sources,1);assert.ok(removed.removed.events>=6);assert.ok(removed.removed.sessions>=1);
 assert.equal(await findSource(a.code),null);assert.equal(await findSource(a.printCode),null);assert.equal((await findSource(b.code))?.id,b.id);
 assert.equal((await getDb().select().from(campaigns).where(eq(campaigns.id,campaign.id))).length,1);
 for(const table of [events,conversions,aliases,linkHistory])assert.equal((await getDb().select().from(table).where(eq(table.sourceId,a.id))).length,0);
 assert.equal((await getDb().select().from(sessions).where(eq(sessions.id,alone.sessionId))).length,0);
 const [repaired]=await getDb().select().from(sessions).where(eq(sessions.id,shared.sessionId));
 assert.equal(repaired.firstSourceId,b.id);assert.equal(repaired.lastSourceId,b.id);assert.equal(repaired.firstAttribution.sourceId,b.id);assert.equal(repaired.lastAttribution.sourceId,b.id);
 assert.ok(!(JSON.stringify(await getDb().select().from(audit))).includes(a.id));
 await assert.rejects(()=>trackOutbound(browser(),'vk',{token:alone.token}),/Источник удалён/);
 assert.equal((await sourceRoute(new Request('http://localhost:3000/r/'+a.code),{params:Promise.resolve({code:a.code})})).status,404);
 const report=await getReport(await parseFilters(new URLSearchParams({dataMode:'test',sourceId:b.id})));
 assert.equal(report.metrics.visits,1);assert.equal(report.metrics.sessions,1);assert.equal(report.metrics.vk,1);assert.equal(report.metrics.conversion,100);assert.equal(report.metrics.confirmed,1);
});

test('campaign purge includes all children and historical snapshots but preserves moved sources elsewhere',async()=>{
 const removed=await makeCampaign('Delete campaign'),retained=await makeCampaign('Retained campaign');
 const child=await makeSource('delete_child',removed.id),archived=await makeSource('delete_archived',removed.id),moved=await makeSource('keep_moved',removed.id);
 await mutate('sources',{...archived,active:false},'test');
 await visit(child.code);await visit(archived.code);
 const historical=await visit(moved.code);
 await mutate('sources',{...moved,campaignId:retained.id},'test');
 await addConversion({clickId:historical.clickId,externalId:'historic',type:'lead'},'manual','test');
 const fresh=await visit(moved.code);await addConversion({clickId:fresh.clickId,externalId:'fresh',type:'lead'},'manual','test');
 const result=await permanentDelete('campaigns',{id:removed.id,confirmation:removed.name},'test');assert.equal(result.removed.sources,2);
 assert.equal((await getDb().select().from(campaigns).where(eq(campaigns.id,removed.id))).length,0);
 assert.equal(await findSource(child.code),null);assert.equal(await findSource(archived.code),null);assert.equal((await findSource(moved.code))?.campaignId,retained.id);
 assert.equal((await getDb().select().from(events).where(eq(events.campaignId,removed.id))).length,0);
 assert.equal((await getDb().select().from(conversions).where(eq(conversions.campaignId,removed.id))).length,0);
 assert.equal((await getDb().select().from(events).where(eq(events.id,fresh.clickId))).length,1);
 assert.equal((await getDb().select().from(conversions).where(eq(conversions.clickId,fresh.clickId))).length,1);
 assert.ok(!(JSON.stringify(await getDb().select().from(audit))).includes(removed.id));
 const empty=await makeCampaign('Empty campaign');assert.equal((await permanentDelete('campaigns',{id:empty.id,confirmation:empty.name},'test')).removed.sources,0);
});

test('delete endpoint requires authorization, CSRF and exact confirmation and leaves no partial deletions',async()=>{
 const source=await makeSource('protected_source');const activity=await visit(source.code);
 const endpoint=(headers:Headers,body:unknown)=>deleteEndpoint(new Request('http://localhost:3000/api/admin/sources',{method:'DELETE',headers,body:JSON.stringify(body)}),{params:Promise.resolve({section:'sources'})});
 assert.equal((await endpoint(new Headers(),{id:source.id,confirmation:source.code})).status,401);
 const [admin]=await getDb().insert(admins).values({email:'delete@example.test',passwordHash:'not-a-login-password'}).returning();
 const authToken='delete-session-test-token',csrf='delete-csrf-test-token';const {digest}=await import('../src/lib/security');
 await getDb().insert(adminSessions).values({id:digest(authToken),adminId:admin.id,csrf,expiresAt:new Date(Date.now()+60000)});
 const headers=new Headers({cookie:'motiv_admin='+authToken,origin:'http://localhost:3000','content-type':'application/json'});
 assert.equal((await endpoint(headers,{id:source.id,confirmation:source.code})).status,403);
 headers.set('x-csrf-token',csrf);headers.set('origin','https://other.test');assert.equal((await endpoint(headers,{id:source.id,confirmation:source.code})).status,403);headers.set('origin','http://localhost:3000');
 assert.equal((await endpoint(headers,{id:source.id,confirmation:'wrong'})).status,400);
 assert.equal((await findSource(source.code))?.id,source.id);assert.equal((await getDb().select().from(events).where(eq(events.id,activity.clickId))).length,1);
 assert.equal((await endpoint(headers,{id:source.id,confirmation:source.code})).status,200);
 assert.equal((await endpoint(headers,{id:source.id,confirmation:source.code})).status,404);
 await assert.rejects(()=>permanentDelete('settings',{id:randomUUID(),confirmation:'test'},'test'),/недоступно/);
});
