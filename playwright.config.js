import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
const executablePath=[process.env.ORRERY_BROWSER,'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
const port=5196;
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',timeout:45000,workers:1,retries:0,reporter:[['list'],['json',{outputFile:'evidence/browser-tests.json'}]],use:{baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:1000},launchOptions:{executablePath,args:['--enable-unsafe-swiftshader']},trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:{command:`npm run preview -- --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:true}});
