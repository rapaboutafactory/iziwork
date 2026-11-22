import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { settings } from './db/schema';
import { defaultContent,type Settings } from './contracts';
export const defaultSettings:Settings={links:{vk:'',telegram:'',max:''},linkModes:{vk:'plain',telegram:'plain',max:'plain'},timezone:'Europe/Moscow',retentionDays:90,metrikaId:process.env.YANDEX_METRIKA_ID||'',draft:defaultContent,published:defaultContent,categories:['offline','online'],platforms:['VK','Telegram','MAX','Twitch','YouTube','Листовки','Расклейка','Почтовые ящики']};
export async function getSettings():Promise<Settings>{const [row]=await getDb().select().from(settings).where(eq(settings.id,'site'));const s={...defaultSettings,...row?.value} as Settings;return {...s,draft:{...defaultContent,...s.draft},published:{...defaultContent,...s.published}};}
export async function saveSettings(value:Settings,db=getDb()){await db.insert(settings).values({id:'site',value:value as unknown as Record<string,unknown>}).onConflictDoUpdate({target:settings.id,set:{value:value as unknown as Record<string,unknown>}});}
