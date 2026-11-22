import QRCode from 'qrcode';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

let logoBody:Promise<string>|undefined;
function brandArtwork(){
 return logoBody??=readFile(path.join(process.cwd(),'public/brand/iziwork-logo.svg'),'utf8').then(svg=>{
  const body=svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if(!body)throw new Error('QR logo is unavailable');
  return body;
 });
}

/** All formats encode the same permanent URL and include a four-module quiet zone. */
export async function makeQr(url:string,format:'png'|'svg',size=1024){
 const code=QRCode.create(url,{errorCorrectionLevel:'H'});
 const modules=code.modules,margin=4,extent=modules.size+margin*2,center=extent/2;
 if(!Number.isInteger(size)||size<extent)throw new RangeError('QR image is too small for its URL');
 // Whole pixels per module keep small PNGs readable; SVG and print use the
 // identical grid. Any remaining pixels become additional white margin.
 const scale=Math.floor(size/extent),offset=(size-extent*scale)/2;
 const tileWidth=modules.size*.22,tileHeight=modules.size*.16;
 const left=center-tileWidth/2,top=center-tileHeight/2;
 const imageWidth=tileWidth*.85,imageHeight=imageWidth*616/1016;
 let matrix='',functional='';
 for(let row=0;row<modules.size;row++){
  let start=-1;
  for(let col=0;col<=modules.size;col++){
   const dark=col<modules.size&&modules.get(row,col);
   if(dark&&start<0)start=col;
   if(!dark&&start>=0){const length=col-start;matrix+=`M${start+margin} ${row+margin}h${length}v1h-${length}z`;start=-1;}
   // Longer URLs can place an alignment pattern at the centre. Keep all its
   // reserved black AND white modules intact, even when they overlap the logo.
   if(col<modules.size&&modules.isReserved(row,col)&&col+margin<left+tileWidth&&col+margin+1>left&&row+margin<top+tileHeight&&row+margin+1>top){
    functional+=`<rect x="${col+margin}" y="${row+margin}" width="1" height="1" fill="${dark?'#000000':'#ffffff'}"/>`;
   }
  }
 }
 const artwork=await brandArtwork();
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR-код IziWork"><title>QR-код IziWork</title><rect width="${size}" height="${size}" fill="#ffffff"/><g transform="translate(${offset} ${offset}) scale(${scale})"><path d="${matrix}" fill="#000000" shape-rendering="crispEdges"/><g id="iziwork-qr-brand"><rect x="${left}" y="${top}" width="${tileWidth}" height="${tileHeight}" rx="0.65" fill="#ffffff"/><svg x="${center-imageWidth/2}" y="${center-imageHeight/2}" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 1016 616" aria-label="Логотип IziWork">${artwork}</svg></g><g shape-rendering="crispEdges">${functional}</g></g></svg>`;
 if(format==='svg')return svg;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
