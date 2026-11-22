import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {eq} from 'drizzle-orm';
import {parse as parseCsv} from 'csv-parse/sync';
import {migrate} from '../scripts/migrate';
import {getDb,closeDb} from '../src/lib/db';
import {campaigns,sources,audit} from '../src/lib/db/schema';
import {mutate,bootstrap} from '../src/lib/admin-service';
import {findSource} from '../src/lib/tracking';
import {getReport,parseFilters} from '../src/lib/report';
import {csvExport} from '../src/lib/exports';
import type {Source} from '../src/lib/contracts';
type Campaign=typeof campaigns.$inferSelect;

process.env.DATABASE_URL='pglite://memory';
Object.assign(process.env,{NODE_ENV:'test',APP_URL:'http://localhost:3000',AUTH_SECRET:'campaign-category-test-secret-for-local-tests'});
before(async()=>{await migrate();await migrate();});
after(closeDb);

test('migration infers uniform legacy campaigns without relabelling mixed or empty campaigns',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('migrations/0001_init.sql','utf8'));
  const legacy=[['offline'],['online','online'],['offline','online'],[],['custom']];
  const ids:string[]=[];
  for(let i=0;i<legacy.length;i++){
   const id=randomUUID();ids.push(id);await db.query('INSERT INTO campaigns (id,name) VALUES ($1,$2)',[id,'legacy '+i]);
   for(let j=0;j<legacy[i].length;j++)await db.query('INSERT INTO sources (name,code,print_code,campaign_id,category,platform) VALUES ($1,$2,$2,$3,$4,$5)',['source',`s${i}${j}`,id,legacy[i][j],'test']);
  }
  const before=await db.query('SELECT id,category FROM sources ORDER BY id');
  await db.exec(await readFile('migrations/0002_campaign_category.sql','utf8'));
  for(const [i,category] of ['offline','online',null,null,null].entries())assert.equal((await db.query<{category:string|null}>('SELECT category FROM campaigns WHERE id=$1',[ids[i]])).rows[0].category,category);
  assert.deepEqual((await db.query('SELECT id,category FROM sources ORDER BY id')).rows,before.rows);
  await db.exec(await readFile('migrations/0003_clear_unclassified_sources.sql','utf8'));
  for(let i=0;i<ids.length;i++){const rows=await db.query<{category:string}>('SELECT category FROM sources WHERE campaign_id=$1',[ids[i]]);assert.ok(rows.rows.every(row=>row.category===(i<2?legacy[i][0]:'')));}
  await assert.rejects(()=>db.query('UPDATE campaigns SET category=$1 WHERE id=$2',['arbitrary',ids[0]]));
 }finally{await db.close();}
});

test('new campaigns require an offline or online category',async()=>{
 await assert.rejects(()=>mutate('campaigns',{name:'Missing category'},'test'));
 await assert.rejects(()=>mutate('campaigns',{name:'Invalid category',category:'other'},'test'));
});

test('sources inherit on create, update, campaign transfer and campaign category change',async()=>{
 const online=await mutate('campaigns',{name:'Online campaign',category:'online'},'test') as Campaign;
 const offline=await mutate('campaigns',{name:'Offline campaign',category:'offline'},'test') as Campaign;
 const first=await mutate('sources',{name:'First source',code:'inherit01',printCode:'ih01',campaignId:online.id,platform:'Instagram',category:'offline',isTest:true},'test') as Source;
 const second=await mutate('sources',{name:'Second source',code:'inherit02',printCode:'ih02',campaignId:online.id,platform:'Telegram',isTest:true},'test') as Source;
 const standalone=await mutate('sources',{name:'Independent',code:'inherit03',printCode:'ih03',category:'custom',platform:'Other',isTest:true},'test') as Source;
 assert.equal(first.category,'online');assert.equal(second.category,'online');
 const edited=await mutate('sources',{...first,category:'offline',name:'Renamed source'},'test') as Source;
 assert.equal(edited.category,'online');
 const changed=await mutate('campaigns',{...online,category:'offline'},'test') as Campaign;
 assert.equal(changed.category,'offline');
 const stored=(await getDb().select().from(sources)).filter(s=>s.campaignId===online.id);
 assert.ok(stored.length===2&&stored.every(s=>s.category==='offline'));
 assert.equal((await findSource('ih01'))?.id,first.id);
 assert.equal((await findSource('ih01'))?.name,'Renamed source');
 assert.deepEqual((await findSource('ih02'))?.links,second.links);
 assert.equal((await findSource('inherit03'))?.category,'custom');
 await mutate('campaigns',{...online,category:'online'},'test');
 const moved=await mutate('sources',{...first,campaignId:offline.id,category:'online'},'test') as Source;
 assert.equal(moved.category,'offline');assert.equal((await findSource('inherit02'))?.category,'online');
 const removed=await mutate('sources',{...moved,campaignId:null,category:'custom'},'test') as Source;
 assert.equal(removed.category,'custom');assert.equal(removed.campaignId,null);
 await assert.rejects(()=>mutate('sources',{name:'Unknown campaign',code:'badcamp',printCode:'badcamp',campaignId:randomUUID(),platform:'Other'},'test'),/Кампания не найдена/);
 await assert.rejects(()=>mutate('sources',{name:'Missing standalone category',code:'missingcat',printCode:'missingcat',platform:'Other'},'test'),/Укажите категорию/);
 const changes=await getDb().select().from(audit).where(eq(audit.action,'campaign.update'));
 assert.ok(changes.some(row=>(row.details as {inheritedSources?:number}).inheritedSources===2));
 const data=await bootstrap(new URLSearchParams({dataMode:'test'}));
 assert.equal(data.campaigns.find(c=>c.id===online.id)?.category,'online');
 const filtered=await getReport(await parseFilters(new URLSearchParams({dataMode:'test',category:'online'})));
 assert.ok(filtered.sources.some(s=>s.id===second.id));assert.ok(!filtered.sources.some(s=>s.id===standalone.id||s.id===first.id));
 const csv=await csvExport(new URLSearchParams({kind:'campaigns',campaignId:online.id,dataMode:'test'}));
 const exported=parseCsv(await csv.text(),{columns:true,bom:true}) as {category:string}[];
 assert.equal(exported[0].category,'online');
});

test('unclassified campaign never falls back to an explicit or default offline source category',async()=>{
 const [legacy]=await getDb().insert(campaigns).values({name:'Legacy mixed'}).returning();
 const source=await mutate('sources',{name:'Legacy source',code:'legacymix',printCode:'legacymix',campaignId:legacy.id,category:'online',platform:'Other',isTest:true},'test') as Source;
 assert.equal(source.category,'');
 const edited=await mutate('sources',{...source,category:'offline'},'test') as Source;assert.equal(edited.category,'');
 await mutate('campaigns',{...legacy,category:'offline'},'test');
 assert.equal((await findSource('legacymix'))?.category,'offline');
});
