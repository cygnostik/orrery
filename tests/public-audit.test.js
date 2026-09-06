import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

test('publication audit rejects private paths without exposing their contents',async()=>{
 const url=new URL('../scripts/public-audit.mjs',import.meta.url);
 assert.ok(existsSync(url),'publication audit must exist');
 const {auditEntries}=await import(url);
 const findings=auditEntries([{path:'.private/deploy.json',content:'confidential fixture'}]);
 assert.equal(findings.length,1);
 assert.equal(findings[0].rule,'private-path');
 assert.ok(!JSON.stringify(findings).includes('confidential fixture'));
});

test('publication audit detects credentials and local paths but allows scientific sources',async()=>{
 const {auditEntries}=await import('../scripts/public-audit.mjs');
 assert.equal(auditEntries([{path:'docs/science.md',content:'https://ssd.jpl.nasa.gov/planets/approx_pos.html'}]).length,0);
 const samples=['-----BEGIN '+'PRIVATE KEY-----','/Users/'+'example/Documents/private.txt','https'+ '://'+'user:examplepass@'+'example.com/'];
 for(const content of samples)assert.ok(auditEntries([{path:'src/example.js',content}]).length>0);
});

test('asset refresh scripts do not generate checksums',()=>{
 const source=readFileSync(new URL('../scripts/download-textures.mjs',import.meta.url),'utf8');
 assert.equal(source.includes('create'+'Hash'),false);
 assert.equal(source.includes('sha'+'256'),false);
});

test('publication rules do not flag their own source as a leaked transcript',async()=>{
 const {auditEntries}=await import('../scripts/public-audit.mjs');
 const content=readFileSync(new URL('../scripts/public-audit.mjs',import.meta.url));
 assert.deepEqual(auditEntries([{path:'scripts/public-audit.mjs',content}]),[]);
});
