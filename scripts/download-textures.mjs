import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const executablePath=[process.env.ORRERY_BROWSER,'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage();await page.goto('https://www.solarsystemscope.com/textures/',{waitUntil:'domcontentloaded'});
 await mkdir('public/textures',{recursive:true});await mkdir('evidence',{recursive:true});
 await writeFile('evidence/texture-source.txt',await page.locator('body').innerText());
 const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.href));
 const wanted=['2k_mercury.jpg','2k_venus_atmosphere.jpg','2k_mars.jpg','2k_jupiter.jpg','2k_saturn.jpg','2k_uranus.jpg','2k_neptune.jpg','2k_earth_daymap.jpg','2k_sun.jpg'];
 const results=[];
 for(const filename of wanted){
  const url=links.find(u=>u.endsWith('/'+filename));if(!url)throw Error(`missing source link ${filename}`);
  const response=await page.request.get(url);if(!response.ok())throw Error(`${response.status()} ${url}`);
  const buffer=await response.body();if(buffer[0]!==255||buffer[1]!==216)throw Error(`not JPEG ${filename}`);
  await writeFile('public/textures/'+filename,buffer);
  results.push({filename,url,bytes:buffer.length});
 }
 await writeFile('evidence/texture-downloads.json',JSON.stringify(results,null,2));console.log(JSON.stringify({count:results.length,results},null,2));
}finally{await browser.close();}
