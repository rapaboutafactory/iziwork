import {makeQr} from './qr';
import {zipSync,strToU8} from 'fflate';
import {eq,inArray} from 'drizzle-orm';
import {getDb} from './db';
import {sources} from './db/schema';
import {getReport,parseFilters,exportEvents,sourceView} from './report';
import {HttpError} from './security';
import {appUrl} from './config';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export function csvCell(value:unknown){let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[\s\t\r\n]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function csvString(rows:Record<string,unknown>[],columns?:string[]){const keys=columns||Object.keys(rows[0]||{});return '\ufeff'+[keys.map(csvCell).join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n');}
export async function csvExport(q:URLSearchParams){const f=await parseFilters(q);const kind=q.get('kind')||'stats';let data:Record<string,unknown>[];
 if(kind==='events'){data=await exportEvents(f) as Record<string,unknown>[];if(data.length>100000)throw new HttpError(413,'Более 100 000 событий: сократите период или выберите источник');}
 else {const report=await getReport(f);if(kind==='stats')data=[{...f,...report.metrics,rawEvents:report.quality.raw,cleanEvents:report.quality.clean,excludedEvents:report.quality.excluded,confirmed_lead:report.confirmedByType.lead||0,confirmed_subscribed:report.confirmedByType.subscribed||0,confirmed_bot_started:report.confirmedByType.bot_started||0,confirmed_task_started:report.confirmedByType.task_started||0,confirmed_first_paid_task:report.confirmedByType.first_paid_task||0}];else if(kind==='campaigns')data=report.campaigns.map(c=>({id:c.id,name:c.name,category:c.category,budget:c.budget,status:c.status,...c.metrics}));else if(kind==='links'||kind==='qr')data=report.sources.map(s=>({id:s.id,name:s.name,code:s.code,printCode:s.printCode,isTest:s.isTest,...s.urls}));else if(kind==='sources')data=report.sources.map(s=>({id:s.id,source:s.name,code:s.code,campaignId:s.campaignId,category:s.category,platform:s.platform,partner:s.partner,creative:s.creative,isTest:s.isTest,...s.metrics}));else throw new HttpError(400,'Неверный тип экспорта');}
 const emptyColumns=kind==='events'?['id','created_at','type','code','campaign_id','session_id','network','clean','reasons','device','browser','is_test','attribution']:kind==='links'||kind==='qr'?['id','name','code','printCode','isTest','main','vk','telegram','max']:kind==='campaigns'?['id','name','category','budget','status','incoming','visits','sessions','vk','telegram','max','clicks','convertedSessions','conversion','confirmed','cost','costPerVisit','costPerSession','costPerClick','costPerLead']:['id','source','code','campaignId','category','platform','partner','creative','isTest','incoming','visits','sessions','vk','telegram','max','clicks','convertedSessions','conversion','confirmed','cost','costPerVisit','costPerSession','costPerClick','costPerLead'];
 return new Response(csvString(data,data.length?undefined:emptyColumns),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="iziwork-${kind}-${f.from}-${f.to}.csv"`,'Cache-Control':'no-store'}});
}
export {makeQr} from './qr';
function xml(text:string){return text.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));}
export async function qrExport(q:URLSearchParams){
 const format=q.get('format')||'png';const size=Number(q.get('size')||1024);if(!Number.isInteger(size)||size<128||size>4096)throw new HttpError(400,'Размер QR: от 128 до 4096 пикселей');
 const ids=(q.get('ids')||q.get('sourceId')||'').split(',').filter(Boolean);if(!ids.length||ids.length>100||ids.some(id=>!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)))throw new HttpError(400,'Выберите от 1 до 100 источников');
 const items=await getDb().select().from(sources).where(inArray(sources.id,ids));if(items.length!==new Set(ids).size)throw new HttpError(404,'Источник не найден');
 if(format==='zip'){
  const files:Record<string,Uint8Array>={};for(const s of items){const url=sourceView(s).urls!.main;files[s.code+'.svg']=strToU8(await makeQr(url,'svg',size) as string);files[s.code+'.png']=await makeQr(url,'png',size) as Buffer;}
  files['sources.csv']=strToU8(csvString(items.map(s=>({name:s.name,code:s.code,isTest:s.isTest,...sourceView(s).urls}))));return new Response(new Uint8Array(zipSync(files)),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="iziwork-qr.zip"','Cache-Control':'no-store'}});
 }
 if(items.length!==1)throw new HttpError(400,'Для нескольких источников выберите ZIP');const s=items[0],url=sourceView(s).urls!.main;
 let content:string|Buffer,type:string;
 if(format==='a5'||format==='a6'){
  const logo=await readFile(path.join(process.cwd(),'public/brand/iziwork-logo-print.svg'),'utf8');
  const logoBody=logo.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];if(!logoBody)throw new Error('Print logo is unavailable');
  const width=format==='a5'?148:105,height=format==='a5'?210:148,qrSize=format==='a5'?100:75;const qr=await makeQr(url,'svg',1024) as string;const paths=qr.replace(/<\?xml[^>]*>/g,'').match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]||'';const viewBox=qr.match(/viewBox="([^"]+)"/)?.[1]||'0 0 100 100';
  content=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><svg x="${(width-26)/2}" y="2" width="26" height="15.76" viewBox="200 257 1016 616" role="img" aria-label="IziWork">${logoBody}</svg><text x="${width/2}" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="3">${xml(s.code)}</text><svg x="${(width-qrSize)/2}" y="24" width="${qrSize}" height="${qrSize}" viewBox="${viewBox}">${paths}</svg><text x="${width/2}" y="${qrSize+33}" text-anchor="middle" font-family="Arial,sans-serif" font-size="3">${xml(url)}</text>${(['vk','telegram','max'] as const).map((n,i)=>`<text x="${width/2}" y="${qrSize+44+i*7}" text-anchor="middle" font-family="Arial,sans-serif" font-size="3">${xml(sourceView(s).urls![n])}</text>`).join('')}</svg>`;type='image/svg+xml';
 }else if(format==='png'||format==='svg'){content=await makeQr(url,format,size);type=format==='png'?'image/png':'image/svg+xml';}else throw new HttpError(400,'Формат: png, svg, a5, a6, zip');
 return new Response(typeof content==='string'?content:new Uint8Array(content),{headers:{'Content-Type':type,'Content-Disposition':`attachment; filename="${s.code}-${format}.${type==='image/png'?'png':'svg'}"`,'Cache-Control':'no-store'}});
}
