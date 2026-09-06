import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const privatePath=/(^|\/)(?:\.private|\.hermes|\.git|node_modules|dist|artifacts|evidence|test-results|playwright-report|blob-report|coverage)(?:\/|$)|(^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|log|zip|map)$/i;
const contentRules=[
 ['local-user-path',/(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//],
 ['windows-user-path',/[A-Z]:\\Users\\[^\\\r\n]+\\/i],
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
 ['credential-url',/\b(?:https?|ssh|sftp):\/\/[^\s/:]+:[^\s/@]+@/i],
 ['credential-assignment',/(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*["'][^"'\s]{8,}["']/i],
 ['internal-service-url',/https?:\/\/agent\.prodyn\.ai\//i],
 ['conversation-scaffolding',new RegExp('\\[OUT-OF-BAND USER '+'MESSAGE|ASYNC DELEGATION '+'BATCH|CONTEXT '+'COMPACTION|SKILL_'+'PRUNED')],
];

export function auditEntries(entries){
 const findings=[];
 for(const {path,content} of entries){
  if(privatePath.test(path)||/\.(?:html|txt|py)$/.test(path)&&/^docs\/(?:science|moon)-evidence\//.test(path)){
   findings.push({path,rule:'private-path'});continue;
  }
  if(/(?:PPNeue|NeueMachina|Inktrap)/i.test(path))findings.push({path,rule:'unapproved-font'});
  const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
  // PNG, JPEG and WOFF2 files are reviewed visually and by asset provenance,
  // not interpreted as arbitrary UTF-8. Paths are checked for every entry.
  if(/\.(?:png|jpg|jpeg|woff2|ico|webp)$/i.test(path))continue;
  const text=bytes.toString('utf8');
  for(const [rule,pattern] of contentRules)if(pattern.test(text))findings.push({path,rule});
 }
 return findings;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const names=execFileSync('git',['ls-files','--cached','-z'],{maxBuffer:8*1024*1024}).toString().split('\0').filter(Boolean);
  if(!names.length)throw new Error('No staged/tracked files to audit. Stage the intended public release first.');
  const entries=names.map(path=>({path,content:execFileSync('git',['show',`:${path}`],{maxBuffer:32*1024*1024})}));
  const findings=auditEntries(entries);
  console.log(JSON.stringify({files:names.length,passed:findings.length===0,findings},null,2));
  if(findings.length)process.exitCode=1;
 }catch(error){console.error(`Public audit failed: ${error.message}`);process.exitCode=1;}
}
