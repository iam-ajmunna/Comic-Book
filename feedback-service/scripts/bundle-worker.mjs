import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = Object.fromEntries([['html','index.html'],['js','app.js'],['css','styles.css'],['setupHtml','setup.html'],['setupJs','setup.js']].map(([kind,path]) => [kind,readFileSync(`${root}admin/${path}`,'utf8')]));
const original = readFileSync(`${root}worker/index.js`,'utf8');
const authImport = "import { createGithubAuth, AdminAuthError } from './github-auth.js';";
if (original.split(authImport).length !== 2) throw new Error('The Worker must import one GitHub authentication module.');
const settingsImport = "import { resolveGithubSettings, saveGithubSettings, githubSettingsStatus } from './github-settings.js';";
if (original.split(settingsImport).length !== 2) throw new Error('The Worker must import one GitHub settings module.');
const source = original.replace(authImport,()=>readFileSync(`${root}worker/github-auth.js`,'utf8')).replace(settingsImport,()=>readFileSync(`${root}worker/github-settings.js`,'utf8').replace("import { AdminAuthError } from './github-auth.js';",''));
const marker = 'export default createWorker();';
if (source.split(marker).length !== 2) throw new Error('The Worker entrypoint must contain one default factory call.');
// Embed source bytes, with no framework, dependency installation or bundler.
writeFileSync(`${root}dist/server/index.js`,source.replace(marker,()=>`export default createWorker(${JSON.stringify(assets)});`));
