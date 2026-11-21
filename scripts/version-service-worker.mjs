import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const path='dist/sw.js';
const version=(process.env.GITHUB_SHA||process.env.DVOLADA_BUILD_ID||Date.now().toString(36)).replace(/[^a-zA-Z0-9-]/g,'').slice(0,40);
let source=readFileSync(path,'utf8');
if(process.env.VITE_DVOLADA_LIVE_MODE==='true'){
 source=source.replace("const ROOT='/DVolada-3.0./';","const ROOT='/';");
 source=source.replace("const MANIFEST='manifest.webmanifest';","const MANIFEST='manifest-live.webmanifest';");
 const assets=readdirSync('dist/assets').filter(name=>/\.(js|css)$/.test(name)).map(name=>'assets/'+name);
 source=source.replace('const LIVE_ASSETS=[];','const LIVE_ASSETS='+JSON.stringify(assets)+';');
}
source=source.replace(/const CACHE='dvolada-shell-[^']+';/,`const CACHE='dvolada-shell-${version}';`);
writeFileSync(path,source+'\n// Build: '+version+'\n');
console.log('PWA build:',version);

// Publish a lightweight build manifest for active desktop and mobile sessions.
writeFileSync('dist/version.json',JSON.stringify({version,updatedAt:new Date().toISOString()})+'\n');
const indexPath='dist/index.html';
const index=readFileSync(indexPath,'utf8');
writeFileSync(indexPath,index.replace('</head>',`<meta name="dvolada-build" content="${version}"/></head>`));
