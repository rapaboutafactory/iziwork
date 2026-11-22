import {sql} from 'drizzle-orm';
import {getDb} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(){try{const result=await getDb().execute(sql`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name='0001_init.sql') AS ready`);await getDb().execute(sql`SELECT id FROM events LIMIT 0`);if(!(result as unknown as {rows:{ready:boolean}[]}).rows[0]?.ready)throw new Error('Migration not applied');return Response.json({status:'ready'});}catch{return Response.json({status:'unavailable'},{status:503});}}
