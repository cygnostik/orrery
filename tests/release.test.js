import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=()=>readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('public metadata identifies the live instrument and a full-size machine social card',()=>{
 const document=html();
 assert.match(document,/<link rel="canonical" href="https:\/\/orrery\.prodyn\.ai\/">/);
 for(const name of ['og:type','og:site_name','og:title','og:description','og:url','og:image','og:image:width','og:image:height','og:image:alt'])assert.match(document,new RegExp(`property="${name}" content="[^\"]+"`));
 assert.match(document,/property="og:image" content="https:\/\/orrery\.prodyn\.ai\/social\/orrery-card\.jpg"/);
 assert.match(document,/property="og:image:width" content="1200"/);
 assert.match(document,/property="og:image:height" content="630"/);
 assert.match(document,/name="twitter:card" content="summary_large_image"/);
 assert.match(document,/name="twitter:image:alt" content="[^\"]+"/);
 assert.match(document,/<link rel="manifest" href="\.\/manifest\.webmanifest">/);
 assert.match(document,/<link rel="apple-touch-icon"[^>]+>/);
 assert.doesNotMatch(document,/Design review edition|follow design approval|Design Preview/);
});

test('hosting revalidates every stable PWA entry point',()=>{
 const config=readFileSync(new URL('../public/.htaccess',import.meta.url),'utf8');
 const patterns=[...config.matchAll(/<FilesMatch "([^"]+)">([\s\S]*?)<\/FilesMatch>/g)].filter(match=>match[2].includes('Cache-Control "no-cache, must-revalidate"')).map(match=>new RegExp(match[1]));
 for(const name of ['index.html','sw.js','manifest.webmanifest','pwa-release.json'])assert.ok(patterns.some(pattern=>pattern.test(name)),name+' must revalidate');
});
