import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {makeQr} from '../src/lib/qr';

async function decoded(input:string|Buffer){
 const {data,info}=await sharp(typeof input==='string'?Buffer.from(input):input).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data;
}

test('branded PNG and self-contained SVG preserve source URLs, including long codes',async()=>{
 for(const url of ['https://rabota.my/r/spb01','https://rabota.my/r/twitch_ivan','https://rabota.my/r/'+ 'x'.repeat(32),'https://tracking.'+'a'.repeat(40)+'.example/r/'+'z'.repeat(32)]){
  const svg=await makeQr(url,'svg',512) as string;
  assert.ok(svg.includes('id="iziwork-qr-brand"'));
  assert.ok(svg.includes('data:image/jpeg;base64,'));
  assert.equal(await decoded(svg),url);
  assert.equal(await decoded(await makeQr(url,'png',512) as Buffer),url);
 }
});

test('small, standard and high-resolution downloads keep exact dimensions and remain readable',async()=>{
 const url='https://rabota.my/r/'+ 'x'.repeat(32);
 for(const size of [128,512,4096]){
  const png=await makeQr(url,'png',size) as Buffer;
  const metadata=await sharp(png).metadata();
  assert.equal(metadata.width,size);assert.equal(metadata.height,size);
  assert.equal(await decoded(png),url);
  assert.equal(await decoded(await makeQr(url,'svg',size) as string),url);
 }
});

test('branding preserves the white quiet zone and every functional module for longer URLs',async()=>{
 const url='https://tracking.'+'a'.repeat(40)+'.example/r/'+'z'.repeat(32);
 const qr=QRCode.create(url,{errorCorrectionLevel:'H'}),extent=qr.modules.size+8,scale=8;
 assert.ok(qr.version>=7,'fixture must include additional alignment patterns');
 const svg=await makeQr(url,'svg',extent*scale) as string;
 const {data,info}=await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3));
 for(let row=0;row<qr.modules.size;row++)for(let col=0;col<qr.modules.size;col++)if(qr.modules.isReserved(row,col)){
  const expected=qr.modules.get(row,col)?0:255;
  assert.deepEqual(pixel((col+4)*scale+scale/2,(row+4)*scale+scale/2),[expected,expected,expected]);
 }
 for(let coordinate=0;coordinate<extent*scale;coordinate++)for(const edge of [0,4*scale-1,info.width-4*scale,info.width-1]){
  assert.deepEqual(pixel(edge,coordinate),[255,255,255]);
  assert.deepEqual(pixel(coordinate,edge),[255,255,255]);
 }
 assert.equal(await decoded(svg),url);
});
