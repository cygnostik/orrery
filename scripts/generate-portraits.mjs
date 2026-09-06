import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const base=process.env.ORRERY_URL||'http://127.0.0.1:5195';
const maps={mercury:'mercury',venus:'venus_atmosphere',earth:'earth_daymap',mars:'mars',jupiter:'jupiter',saturn:'saturn',uranus:'uranus',neptune:'neptune'};
const executablePath=[process.env.ORRERY_BROWSER,'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage();
 await page.route('**/__portrait-generator',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local surface projection</title>'}));
 await page.goto(`${base}/__portrait-generator`);
 await mkdir('public/assets/portraits',{recursive:true});
 for(const [id,map] of Object.entries(maps)){
  const data=await page.evaluate(async({base,map,id})=>{
   const image=new Image();image.src=`${base}/textures/2k_${map}.jpg`;await image.decode();
   const source=document.createElement('canvas');source.width=image.width;source.height=image.height;
   const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(0,0,image.width,image.height).data;
   const canvas=document.createElement('canvas');const size=384;canvas.width=canvas.height=size;
   const out=canvas.getContext('2d'),result=out.createImageData(size,size);
   const longitude={mercury:.14,venus:.38,earth:.04,mars:.34,jupiter:.27,saturn:.15,uranus:.18,neptune:.21}[id];
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x+.5-size/2)/(size/2-2),ny=-(y+.5-size/2)/(size/2-2),r2=nx*nx+ny*ny;
    if(r2>=1)continue;
    const nz=Math.sqrt(1-r2),u=((Math.atan2(nx,nz)/(Math.PI*2)+.5+longitude)%1+1)%1,v=.5-Math.asin(ny)/Math.PI;
    const sx=Math.min(image.width-1,Math.floor(u*image.width)),sy=Math.min(image.height-1,Math.floor(v*image.height));
    const from=(sy*image.width+sx)*4,to=(y*size+x)*4;
    const light=.14+.86*Math.max(0,-.48*nx+.32*ny+.8178*nz);
    for(let c=0;c<3;c++)result.data[to+c]=Math.round(pixels[from+c]*light);
    result.data[to+3]=Math.round(255*Math.min(1,(1-Math.sqrt(r2))*size/2));
   }
   out.putImageData(result,0,0);return canvas.toDataURL('image/png').split(',')[1];
  },{base,map,id});
  await writeFile(`public/assets/portraits/${id}.png`,Buffer.from(data,'base64'));
  console.log(`Projected ${id} from local 2k_${map}.jpg (384×384)`);
 }
}finally{await browser.close();}
