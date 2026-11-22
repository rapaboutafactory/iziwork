import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';
type Db = NodePgDatabase<typeof schema>;
type State = {db:Db;pool?:Pool;embedded?:PGlite};
const globalDb = globalThis as unknown as {motivDb?:State};
export function getDb():Db {
 if(globalDb.motivDb) return globalDb.motivDb.db;
 const url=process.env.DATABASE_URL || (process.env.NODE_ENV==='production' ? '' : 'pglite://./.data/postgres');
 if(!url) throw new Error('DATABASE_URL is required in production');
 if(url.startsWith('pglite://')) {
  if(process.env.NODE_ENV==='production' && process.env.ALLOW_PGLITE_PRODUCTION!=='true') throw new Error('Use PostgreSQL in production');
  const target=url.slice('pglite://'.length); const directory=target==='memory' ? undefined : path.resolve(target);
  if(directory) fs.mkdirSync(directory,{recursive:true});
  const embedded = new PGlite(directory);
  globalDb.motivDb={embedded,db:pgliteDrizzle(embedded,{schema}) as unknown as Db};
 } else {const pool=new Pool({connectionString:url,max:Number(process.env.DB_POOL_SIZE||10),connectionTimeoutMillis:5000,statement_timeout:15000});globalDb.motivDb={pool,db:drizzle(pool,{schema})};}
 return globalDb.motivDb!.db;
}
export async function closeDb(){const s=globalDb.motivDb;if(s?.pool) await s.pool.end();if(s?.embedded) await s.embedded.close();delete globalDb.motivDb;}
