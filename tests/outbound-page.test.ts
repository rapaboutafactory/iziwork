import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {migrate} from '../scripts/migrate';
import {getDb,closeDb} from '../src/lib/db';
import {events} from '../src/lib/db/schema';
import {trackLanding} from '../src/lib/tracking';
import {mutate} from '../src/lib/admin-service';
import {GET,HEAD} from '../src/app/go/[network]/route';

process.env.DATABASE_URL='pglite://memory';Object.assign(process.env,{NODE_ENV:'test',APP_URL:'http://localhost:3000',AUTH_SECRET:'outbound-new-tab-test-secret-1234567890'});
before(async()=>{await migrate();await mutate('links',{links:{vk:'https://vk.ru/newtab',telegram:'https://t.me/newtab',max:'https://max.ru/newtab'}},'test');});after(closeDb);

test('new-tab bridge creates a landing history entry, restores cached Back navigation and counts only the final redirect',async()=>{
 const headers=new Headers({'user-agent':'Mozilla/5.0 Chrome/130.0','accept':'text/html','sec-fetch-mode':'navigate'});
 const visit=await trackLanding(headers,new URLSearchParams());const count=(await getDb().select().from(events)).length;
 for(const network of ['vk','telegram','max']){
  const route='/go/'+network+'?token='+encodeURIComponent(visit.token);
  const bridge=await GET(new Request('http://localhost:3000'+route+'&newtab=1',{headers}),{params:Promise.resolve({network})});assert.equal(bridge.status,200);
  const html=await bridge.text();assert.equal(bridge.headers.get('referrer-policy'),'no-referrer');assert.ok(!html.includes('<meta http-equiv="refresh"'));
  const script=html.match(/<script>([\s\S]*?)<\/script>/)![1];const history:string[]=[],forward:string[]=[],replace:string[]=[],callbacks:Record<string,(event:{persisted:boolean})=>void>={};const timers:(()=>void)[]=[];
  runInNewContext(script,{history:{replaceState:(_state:unknown,_unused:string,url:string)=>history.push(url)},location:{assign:(url:string)=>forward.push(url),replace:(url:string)=>replace.push(url)},addEventListener:(type:string,callback:(event:{persisted:boolean})=>void)=>{callbacks[type]=callback;},setTimeout:(callback:()=>void)=>timers.push(callback)});
  assert.deepEqual(history,['/?entry='+encodeURIComponent(visit.token)]);assert.equal(forward.length,0);
  callbacks.pageshow({persisted:false});assert.equal(forward.length,0);timers.shift()!();assert.deepEqual(forward,[route]);
  callbacks.pageshow({persisted:true});assert.deepEqual(replace,history);assert.equal(forward.length,1);
 }
 assert.equal((await getDb().select().from(events)).length,count);
 const redirect=await GET(new Request('http://localhost:3000/go/vk?token='+visit.token,{headers}),{params:Promise.resolve({network:'vk'})});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://vk.ru/newtab');
 assert.equal((await getDb().select().from(events)).length,count+1);
});

test('bridge rejects unsigned tokens and unknown networks; HEAD never records events',async()=>{
 const count=(await getDb().select().from(events)).length;
 assert.equal((await GET(new Request('http://localhost:3000/go/vk?token=invalid&newtab=1'),{params:Promise.resolve({network:'vk'})})).status,400);
 assert.equal((await GET(new Request('http://localhost:3000/go/unknown?newtab=1'),{params:Promise.resolve({network:'unknown'})})).status,404);
 assert.equal((await HEAD()).status,204);assert.equal((await getDb().select().from(events)).length,count);
});
