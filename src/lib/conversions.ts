import {eq} from 'drizzle-orm';
import {getDb} from './db';
import {events,sources,conversions} from './db/schema';
import {conversionSchema} from './validation';
import {findSource} from './tracking';
import {HttpError,logAudit} from './security';
import {parse} from 'csv-parse/sync';
export async function prepareConversion(input:unknown,origin:string){const value=conversionSchema.parse(input);let source;let clickCampaign:string|null|undefined;
 if(value.sourceId){[source]=await getDb().select().from(sources).where(eq(sources.id,value.sourceId));}
 if(value.sourceCode){const match=await findSource(value.sourceCode);if(source&&match?.id!==source.id)throw new HttpError(400,'Источник и код не совпадают');source=match;}
 if(value.clickId){const [event]=await getDb().select().from(events).where(eq(events.id,value.clickId));if(!event||!['social_click','print_click'].includes(event.type)||!event.sourceId)throw new HttpError(400,'Неизвестный clickId или источник отсутствует');if(source&&source.id!==event.sourceId)throw new HttpError(400,'clickId принадлежит другому источнику');clickCampaign=event.campaignId;[source]=await getDb().select().from(sources).where(eq(sources.id,event.sourceId));}
 if(!source)throw new HttpError(400,'Укажите существующий источник или совместимый clickId');
 const date=value.occurredAt?new Date(value.occurredAt):new Date();if(+date>Date.now()+300000)throw new HttpError(400,'Дата результата находится в будущем');
 return {externalId:origin+':'+value.externalId,sourceId:source.id,campaignId:clickCampaign===undefined?source.campaignId:clickCampaign,clickId:value.clickId||null,type:value.type,count:value.count,origin,isTest:source.isTest,occurredAt:date};
}
export async function addConversion(input:unknown,origin:string,actor:string){const value=await prepareConversion(input,origin);return getDb().transaction(async tx=>{const [row]=await tx.insert(conversions).values(value).onConflictDoNothing({target:conversions.externalId}).returning();if(row)await logAudit(actor,'conversion.create',{sourceId:row.sourceId,type:row.type,count:row.count,origin},tx as unknown as ReturnType<typeof getDb>);return {inserted:!!row,duplicate:!row};});}
export async function importConversions(csv:string,actor:string){
 if(csv.length>1024*1024)throw new HttpError(413,'CSV не более 1 МБ');let data:Record<string,string>[];try{data=parse(csv,{columns:true,bom:true,skip_empty_lines:true,trim:true,max_record_size:10000});}catch{throw new HttpError(400,'Ошибка чтения CSV');}
 if(!data.length||data.length>5000)throw new HttpError(400,'CSV должен содержать от 1 до 5000 строк');
 const prepared:Awaited<ReturnType<typeof prepareConversion>>[]=[];for(let i=0;i<data.length;i++){const row=data[i];try{prepared.push(await prepareConversion({sourceCode:row.source_code,externalId:row.external_id,type:row.type,count:row.count,occurredAt:row.occurred_at||undefined},'import'));}catch(e){throw new HttpError(400,`Строка ${i+2}: ${(e as Error).message}`);}}
 return getDb().transaction(async tx=>{let inserted=0;for(const row of prepared){const saved=await tx.insert(conversions).values(row).onConflictDoNothing({target:conversions.externalId}).returning({id:conversions.id});inserted+=saved.length;}await logAudit(actor,'conversion.import',{inserted,duplicates:data.length-inserted},tx as unknown as ReturnType<typeof getDb>);return {inserted,duplicates:data.length-inserted};});
}
