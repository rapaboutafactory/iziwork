import './env';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../src/lib/db';
import {campaigns,sources,aliases} from '../src/lib/db/schema';
export async function seed(){const db=getDb();const demoCampaigns=new Map<string,typeof campaigns.$inferSelect>();for(const category of ['offline','online'] as const){const name='[ТЕСТ] Проверка трекинга · '+(category==='offline'?'Офлайн':'Онлайн');const [old]=await db.select().from(campaigns).where(eq(campaigns.name,name));const campaign=old||(await db.insert(campaigns).values({name,category,budget:0}).returning())[0];demoCampaigns.set(category,campaign);}
 for(const data of [{code:'spb01',name:'Расклейка / Район 1',category:'offline',platform:'Расклейка',printCode:'p01'},{code:'spb02',name:'Почтовые ящики / Район 2',category:'offline',platform:'Почтовые ящики',printCode:'p02'},{code:'twitch01',name:'Реклама у стримера',category:'online',platform:'Twitch',printCode:'tw01'},{code:'vkpub01',name:'Реклама в VK-паблике',category:'online',platform:'VK',printCode:'vp01'}]){
  await db.transaction(async tx=>{const [old]=await tx.select().from(sources).where(eq(sources.code,data.code));if(old){if(!old.isTest)throw new Error('Код '+data.code+' уже используется реальным источником; seed остановлен');return;}
   const campaign=demoCampaigns.get(data.category)!;const [s]=await tx.insert(sources).values({...data,category:campaign.category||'',name:'[ТЕСТ] '+data.name,campaignId:campaign.id,city:data.category==='offline'?'Санкт-Петербург':'',isTest:true,comments:'Тестовый источник. Исключён из реальных отчётов по умолчанию.'}).returning();for(const code of [s.code,s.printCode])await tx.insert(aliases).values({code,sourceId:s.id});
  });
 }
 console.log('Готово: 4 тестовых источника. Искусственные визиты и клики не создавались.');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/seed.ts')) seed().then(closeDb).catch(async e=>{console.error(e.message);await closeDb();process.exitCode=1;});
