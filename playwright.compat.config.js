import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';

const executablePath=[process.env.ORRERY_BROWSER,'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
const port=Number(process.env.ORRERY_COMPAT_PORT||5274);
export default defineConfig({
 testDir:'./tests',testMatch:'**/compatibility*.spec.js',timeout:90000,expect:{timeout:15000},workers:1,retries:0,
 outputDir:'evidence/compatibility/test-results',
 reporter:[['list'],['json',{outputFile:'evidence/compatibility/results.json'}]],
 use:{baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
  {name:'chromium',use:{browserName:'chromium',launchOptions:{executablePath,args:['--enable-unsafe-swiftshader']}}},
  {name:'webkit',use:{browserName:'webkit'}},
 ],
 webServer:{command:`npx vite build --outDir evidence/compatibility/dist --emptyOutDir && npx vite preview --host 127.0.0.1 --port ${port} --strictPort --outDir evidence/compatibility/dist`,url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:120000},
});
