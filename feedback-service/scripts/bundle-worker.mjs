import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = Object.fromEntries([['html','index.html'],['js','app.js'],['css','styles.css']].map(([kind,path]) => [kind,readFileSync(`${root}admin/${path}`,'utf8')]));
const source = readFileSync(`${root}worker/index.js`,'utf8');
const marker = 'export default createWorker();';
if (source.split(marker).length !== 2) throw new Error('The Worker entrypoint must contain one default factory call.');
// Embed source bytes, with no framework, dependency installation or bundler.
writeFileSync(`${root}dist/server/index.js`,source.replace(marker,`export default createWorker(${JSON.stringify(assets)});`));
