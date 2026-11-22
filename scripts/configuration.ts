import './env';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb,closeDb} from '../src/lib/db';
import {campaigns,sources,aliases,settings as settingsTable} from '../src/lib/db/schema';
import {getSettings,saveSettings} from '../src/lib/settings';
import {campaignSchema,sourceSchema,contentSchema,linksSchema,modesSchema,codeSchema} from '../src/lib/validation';
import {logAudit} from '../src/lib/security';

// Configuration transfer deliberately excludes passwords, sessions and analytics.
const date=z.iso.datetime({offset:true});
const list=z.array(z.string().trim().min(1).max(100)).min(1).max(100);
const payloadSchema=z.object({
 format:z.literal('iziwork-config-v1'),
 settings:z.object({links:linksSchema,linkModes:modesSchema,timezone:z.string().max(100),retentionDays:z.number().int().min(1).max(730),metrikaId:z.string().regex(/^\d{0,12}$/),draft:contentSchema,published:contentSchema,categories:list,platforms:list}),
 campaigns:z.array(campaignSchema.extend({id:z.uuid(),createdAt:date,category:campaignSchema.shape.category.nullable().default(null)})).max(100000),
 sources:z.array(sourceSchema.extend({id:z.uuid(),createdAt:date,category:z.string().trim().max(80)})).max(100000),
 aliases:z.array(z.object({code:codeSchema,sourceId:z.uuid()})).max(200000)
});

async function main(){
 const [mode,file]=process.argv.slice(2);
 if(!file||!['export','import'].includes(mode))throw new Error('Usage: tsx scripts/configuration.ts export|import PATH');
 const db=getDb();
 if(mode==='export'){
  const data=JSON.parse(JSON.stringify({format:'iziwork-config-v1',settings:await getSettings(),campaigns:await db.select().from(campaigns),sources:await db.select().from(sources),aliases:await db.select().from(aliases)}));
  const value=payloadSchema.parse(data);
  await writeFile(file,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
  console.log(JSON.stringify({file:resolve(file),campaigns:value.campaigns.length,sources:value.sources.length,testSources:value.sources.filter(item=>item.isTest).length,linksConfigured:Object.fromEntries(Object.entries(value.settings.links).map(([key,url])=>[key,!!url]))}));
  return;
 }
 const value=payloadSchema.parse(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')));
 new Intl.DateTimeFormat('ru',{timeZone:value.settings.timezone}).format();
 const campaignIds=new Set(value.campaigns.map(item=>item.id));
 const sourceIds=new Set(value.sources.map(item=>item.id));
 if(value.sources.some(item=>item.campaignId&&!campaignIds.has(item.campaignId))||value.aliases.some(item=>!sourceIds.has(item.sourceId)))throw new Error('Broken configuration references.');
 for(const source of value.sources)for(const code of new Set([source.code,source.printCode]))if(!value.aliases.some(alias=>alias.code===code&&alias.sourceId===source.id))throw new Error('Missing permanent source alias.');
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(73491822)`);
  for(const table of [campaigns,sources,aliases,settingsTable])if((await tx.select().from(table).limit(1)).length)throw new Error('Target configuration is not empty; refusing to overwrite.');
  for(const item of value.campaigns)await tx.insert(campaigns).values({...item,createdAt:new Date(item.createdAt)});
  const campaignCategories=new Map(value.campaigns.map(item=>[item.id,item.category]));
  for(const item of value.sources)await tx.insert(sources).values({...item,category:item.campaignId?(campaignCategories.get(item.campaignId)||''):item.category,campaignId:item.campaignId||null,createdAt:new Date(item.createdAt)});
  if(value.aliases.length)await tx.insert(aliases).values(value.aliases);
  const transaction=tx as unknown as ReturnType<typeof getDb>;
  await saveSettings(value.settings,transaction);
  await logAudit('cli','configuration.import',{campaigns:value.campaigns.length,sources:value.sources.length,testSources:value.sources.filter(item=>item.isTest).length},transaction);
 });
 console.log(JSON.stringify({imported:true,campaigns:value.campaigns.length,sources:value.sources.length,analyticsImported:false,administratorsImported:false}));
}
main().finally(closeDb).catch(error=>{console.error(error.message);process.exitCode=1;});
