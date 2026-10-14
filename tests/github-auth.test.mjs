import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubAuth,GITHUB_OWNER} from '../feedback-service/worker/github-auth.js';
import {createWorker} from '../feedback-service/worker/index.js';
import {resolveGithubSettings,saveGithubSettings,githubSettingsStatus} from '../feedback-service/worker/github-settings.js';

class AuthBucket {
  data = new Map();
  versions = new Map();
  async get(key) { const value=this.data.get(key); return value ? {json:async()=>JSON.parse(value),etag:'v'+(this.versions.get(key)||0)} : null; }
  async put(key,value,{onlyIf}={}) { if(onlyIf?.etagDoesNotMatch==='*' && this.data.has(key))return null;if(onlyIf?.etagMatches && onlyIf.etagMatches!=='v'+this.versions.get(key))return null;this.data.set(key,value);this.versions.set(key,(this.versions.get(key)||0)+1);return {etag:'v'+this.versions.get(key)}; }
  async delete(key) { this.data.delete(key); }
  async list({prefix}) { return {objects:[...this.data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false}; }
}
const req=(path,headers={},method='GET')=>new Request('https://feedback.example'+path,{method,headers});
const cookies=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]);
function fixture(user=GITHUB_OWNER) {
  let time=Date.now(),requests=[];
  const env={BUCKET:new AuthBucket(),GITHUB_CLIENT_ID:'test-client-id',GITHUB_CLIENT_SECRET:'test-client-secret',ADMIN_SESSION_SECRET:'test-session-key-'.repeat(4)};
  const auth=createGithubAuth({now:()=>time,fetcher:async(url,options)=>{
    requests.push({url,options});
    if(url==='https://github.com/login/oauth/access_token')return Response.json({access_token:'synthetic-github-token',token_type:'bearer',scope:''});
    assert.equal(url,'https://api.github.com/user');assert.equal(options.headers.Authorization,'Bearer synthetic-github-token');
    return Response.json({id:user.id,login:user.login});
  }});
  return {env,auth,requests,advance:ms=>{time+=ms;}};
}
async function flow(f) {
  const begin=await f.auth.begin(req('/auth/github'),f.env),url=new URL(begin.headers.get('location'));
  const flowCookie=cookies(begin)[0];
  const callback=req('/auth/github/callback?state='+url.searchParams.get('state')+'&code=test-valid-code',{Cookie:flowCookie});
  return {begin,url,flowCookie,callback};
}
async function login(f) { const begun=await flow(f),result=await f.auth.callback(begun.callback,f.env);return {result,sessionCookie:cookies(result)[1],...begun}; }

test('GitHub login requests identity only, with signed state, PKCE and secure cookies',async()=>{
  const f=fixture(),{begin,url,flowCookie}=await flow(f);
  assert.equal(begin.status,303);assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/login/oauth/authorize');
  assert.equal(url.searchParams.get('login'),'iam-ajmunna');assert.equal(url.searchParams.get('scope'),'');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('allow_signup'),'false');
  assert.equal(url.searchParams.get('redirect_uri'),'https://feedback.example/auth/github/callback');
  assert.match(url.searchParams.get('state'),/^[\w-]{43}$/);assert.match(url.searchParams.get('code_challenge'),/^[\w-]{43}$/);
  assert.match(begin.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  assert.equal(f.env.BUCKET.data.size,0,'starting auth never creates public/private storage records');
  assert.doesNotMatch(flowCookie,/test-client-secret|synthetic-github-token/);
});
test('only the pinned GitHub account receives a revocable admin session; provider tokens stay ephemeral',async()=>{
  const f=fixture(),{result,sessionCookie,url}=await login(f);
  assert.equal(result.headers.get('location'),'/admin');assert.match(result.headers.getSetCookie()[0],/Max-Age=0/);
  const identity=await f.auth.requireSession(req('/api/admin/session',{Cookie:sessionCookie}),f.env);
  assert.deepEqual(identity,{userId:'github:'+GITHUB_OWNER.id,login:GITHUB_OWNER.login,provider:'github',role:'admin'});
  const exchanged=JSON.parse(f.requests[0].options.body);
  const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(exchanged.code_verifier))).toString('base64url');
  assert.equal(digest,url.searchParams.get('code_challenge'));
  assert.equal(exchanged.redirect_uri,'https://feedback.example/auth/github/callback');
  for(const [key,value] of f.env.BUCKET.data){assert.match(key,/^admin-sessions\/[\w-]{43}$/);assert.doesNotMatch(value,/synthetic-github-token|test-client-secret|test-session-key/);assert.ok(!key.includes(sessionCookie.split('=')[1]));}
});
test('mismatched, forged, missing and expired OAuth state fail before any provider request',async()=>{
  for(const kind of ['missing','state','tampered','expired']) {
    const f=fixture(),{callback,flowCookie}=await flow(f);
    let bad=callback;
    if(kind==='missing')bad=req(new URL(callback.url).pathname+new URL(callback.url).search);
    if(kind==='state')bad=req('/auth/github/callback?state=wrong&code=test-valid-code',{Cookie:flowCookie});
    if(kind==='tampered')bad=req(new URL(callback.url).pathname+new URL(callback.url).search,{Cookie:flowCookie.slice(0,-5)+'ABCDE'});
    if(kind==='expired')f.advance(600_001);
    await assert.rejects(f.auth.callback(bad,f.env),e=>e.status===401);assert.equal(f.requests.length,0);assert.equal(f.env.BUCKET.data.size,0);
  }
});
test('matching login with wrong GitHub ID, and matching ID with wrong login, cannot become admin',async()=>{
  for(const user of [{id:123,login:GITHUB_OWNER.login},{id:GITHUB_OWNER.id,login:'another-user'}]){
    const f=fixture(user),{callback}=await flow(f);await assert.rejects(f.auth.callback(callback,f.env),e=>e.status===403);assert.equal(f.env.BUCKET.data.size,0);
  }
});
test('GitHub sessions deny fabricated cookies and expire after one hour',async()=>{
  const f=fixture(),{sessionCookie}=await login(f);
  for(const Cookie of ['', '__Host-aj-feedback-admin='+'A'.repeat(43),sessionCookie+'; '+sessionCookie])
    await assert.rejects(f.auth.requireSession(req('/api/admin/session',{Cookie}),f.env),e=>e.status===401);
  f.advance(3_600_001);await assert.rejects(f.auth.requireSession(req('/api/admin/session',{Cookie:sessionCookie}),f.env),e=>e.status===401);
});
test('sign-out checks Origin and revokes the server session without affecting feedback',async()=>{
  const f=fixture(),{sessionCookie}=await login(f);f.env.BUCKET.data.set('reviews/retained.json','{"text":"retained"}');
  await assert.rejects(f.auth.logout(req('/auth/github/logout',{Cookie:sessionCookie,Origin:'https://external.example'},'POST'),f.env),e=>e.status===403);
  await f.auth.requireSession(req('/api/admin/session',{Cookie:sessionCookie}),f.env);
  const result=await f.auth.logout(req('/auth/github/logout',{Cookie:sessionCookie,Origin:'https://feedback.example'},'POST'),f.env);
  assert.equal(result.headers.get('location'),'/admin');assert.match(result.headers.getSetCookie()[0],/Max-Age=0/);
  await assert.rejects(f.auth.requireSession(req('/api/admin/session',{Cookie:sessionCookie}),f.env),e=>e.status===401);
  assert.ok(f.env.BUCKET.data.has('reviews/retained.json'));
});
test('configured Worker uses GitHub exclusively, protects its dashboard/assets, and keeps private sessions out of public feeds',async()=>{
  const f=fixture(),{sessionCookie}=await login(f),worker=createWorker({html:'<main id="admin-list">Owner</main><!--ADMIN_SIGNOUT-->',js:'export const ok=true;'},{auth:f.auth});
  f.env.ADMIN_EMAIL='test@example.invalid';
  const platformOwner=req('/api/admin/session',{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':f.env.ADMIN_EMAIL});
  assert.equal((await worker.fetch(platformOwner,f.env)).status,401,'legacy identity cannot bypass configured GitHub login');
  const page=await worker.fetch(req('/admin',{Cookie:sessionCookie}),f.env);assert.equal(page.status,200);const html=await page.text();assert.match(html,/auth\/github\/logout/);assert.doesNotMatch(html,/signin-with-chatgpt|test-client-secret/);
  const anon=await worker.fetch(req('/admin'),f.env);assert.equal(anon.status,401);assert.match(await anon.text(),/Sign in with GitHub/);
  assert.equal((await worker.fetch(req('/admin/app.js'),f.env)).status,401);
  const feed=await worker.fetch(req('/api/feedback?book=multiversal-love&edition=v1'),f.env);assert.deepEqual((await feed.json()).reviews,[]);
  const partial=await worker.fetch(platformOwner,{...f.env,GITHUB_CLIENT_SECRET:''});assert.equal(partial.status,503,'partial configuration fails closed');
});
test('provider outages and cancelled consent do not issue admin sessions or disclose credentials',async()=>{
  const f=fixture(),begun=await flow(f);
  const cancelled=req('/auth/github/callback?state='+begun.url.searchParams.get('state')+'&error=access_denied',{Cookie:begun.flowCookie});
  await assert.rejects(f.auth.callback(cancelled,f.env),e=>e.status===401);assert.equal(f.requests.length,0);
  const broken=createGithubAuth({fetcher:async()=>{throw new Error('private provider debug data');}});
  await assert.rejects(broken.callback(begun.callback,f.env),e=>e.status===502 && !e.message.includes('private provider'));
  assert.equal(f.env.BUCKET.data.size,0);
});

const credentials={clientId:'synthetic-oauth-client-id',clientSecret:'synthetic-github-secret-for-tests-only',version:null};
function setupEnv(){return {...fixture().env,GITHUB_CLIENT_ID:undefined,GITHUB_CLIENT_SECRET:undefined,ADMIN_EMAIL:'owner@example.invalid'};}
const ownerSetup=(body,extra={})=>req('/api/admin/github-setup',{'oai-authenticated-user-id':'trusted-site-owner','oai-authenticated-user-email':'owner@example.invalid',Origin:'https://feedback.example',...(body?{'Content-Type':'application/json'}:{}),...extra},body?'POST':'GET');
function setupPost(body,extra={}) { const base=ownerSetup(body,extra);return new Request(base.url,{method:'POST',headers:base.headers,body:JSON.stringify(body)}); }
test('one-time owner setup encrypts credentials, hides their values, and enables GitHub without a redeploy',async()=>{
  const env=setupEnv(),worker=createWorker(),before=await githubSettingsStatus(env,'https://feedback.example');assert.equal(before.configured,false);
  const saved=await worker.fetch(setupPost(credentials),env);assert.equal(saved.status,200);
  const status=await (await worker.fetch(ownerSetup(),env)).json();assert.equal(status.configured,true);assert.equal(status.callback,'https://feedback.example/auth/github/callback');assert.equal(status.clientSecret,undefined);assert.equal(status.clientId,undefined);
  const encrypted=env.BUCKET.data.get('admin-settings/github-oauth');assert.doesNotMatch(encrypted,/synthetic-oauth|synthetic-github/);
  const resolved=await resolveGithubSettings(env,'https://feedback.example');assert.equal(resolved.GITHUB_CLIENT_ID,credentials.clientId);assert.equal(resolved.GITHUB_CLIENT_SECRET,credentials.clientSecret);
  const login=await worker.fetch(req('/auth/github'),env);assert.equal(login.status,303);assert.equal(new URL(login.headers.get('location')).searchParams.get('client_id'),credentials.clientId);
  const previousOwner=req('/api/admin/session',{'oai-authenticated-user-id':'trusted-site-owner','oai-authenticated-user-email':env.ADMIN_EMAIL});assert.equal((await worker.fetch(previousOwner,env)).status,401);
  const publicFeed=await (await worker.fetch(req('/api/feedback?book=multiversal-love&edition=v1'),env)).json();assert.deepEqual(publicFeed.reviews,[]);
});
test('setup denies anonymous/other users, missing Origin, malformed credentials and stale edits',async()=>{
  const env=setupEnv(),worker=createWorker();
  assert.equal((await worker.fetch(req('/api/admin/github-setup'),env)).status,401);
  assert.equal((await worker.fetch(setupPost(credentials,{'oai-authenticated-user-email':'other@example.invalid'}),env)).status,403);
  const missing=setupPost(credentials);missing.headers.delete('origin');assert.equal((await worker.fetch(missing,env)).status,403);
  const invalid=await worker.fetch(setupPost({...credentials,clientSecret:'short'}),env);assert.equal(invalid.status,422);assert.equal((await invalid.json()).field,'clientSecret');assert.equal(env.BUCKET.data.size,0);
  await saveGithubSettings(env,'https://feedback.example',credentials);
  assert.equal((await worker.fetch(setupPost(credentials),env)).status,200,'an unchanged uncertain retry is safe');
  assert.equal((await worker.fetch(setupPost({...credentials,clientSecret:'different-synthetic-client-secret'}),env)).status,409);
});
test('encrypted settings are bound to their Site and can be recovered only through verified owner setup',async()=>{
  const env=setupEnv();await saveGithubSettings(env,'https://feedback.example',credentials);
  await assert.rejects(resolveGithubSettings(env,'https://another.example'),e=>e.status===503);
  const key='admin-settings/github-oauth',encrypted=JSON.parse(env.BUCKET.data.get(key));encrypted.data[0]^=1;env.BUCKET.data.set(key,JSON.stringify(encrypted));
  await assert.rejects(resolveGithubSettings(env,'https://feedback.example'),e=>e.status===503);
  const brokenPage=await createWorker().fetch(req('/admin',{'oai-authenticated-user-id':'trusted-site-owner','oai-authenticated-user-email':env.ADMIN_EMAIL}),env);
  assert.equal(brokenPage.status,503);assert.match(await brokenPage.text(),/Owner GitHub setup \/ recovery/,'unreadable credentials fail closed and retain a recovery route');
  const current=await githubSettingsStatus(env,'https://feedback.example');
  await saveGithubSettings(env,'https://feedback.example',{...credentials,version:current.version});assert.equal((await resolveGithubSettings(env,'https://feedback.example')).GITHUB_CLIENT_ID,credentials.clientId);
});
