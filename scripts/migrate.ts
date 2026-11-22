import './env';
import { sql } from 'drizzle-orm';
import { readdir,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDb,closeDb } from '../src/lib/db';
export async function migrate(){
 const db=getDb();
 await db.execute(sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
 await db.transaction(async tx=>{
  // Transaction-level lock prevents two replicas applying the same migration concurrently.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(73491821)`);
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   const raw=await readFile('migrations/'+file,'utf8');const checksum=createHash('sha256').update(raw).digest('hex');
   const result=await tx.execute(sql`SELECT checksum FROM schema_migrations WHERE name=${file}`);
   const rows=(result as unknown as {rows:{checksum:string}[]}).rows;
   if(rows.length){if(rows[0].checksum!==checksum) throw new Error('Migration checksum changed: '+file);continue;}
   // Files are trusted version-controlled SQL; all runtime data uses bound parameters.
   for(const statement of raw.split(';').map(s=>s.trim()).filter(Boolean)) await tx.execute(sql.raw(statement));
   await tx.execute(sql`INSERT INTO schema_migrations(name,checksum) VALUES(${file},${checksum})`);
   console.log('Applied',file);
  }
 });
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/migrate.ts')) migrate().then(closeDb).catch(async e=>{console.error(e.message);await closeDb();process.exitCode=1;});
