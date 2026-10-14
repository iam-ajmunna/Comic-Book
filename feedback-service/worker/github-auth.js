// GitHub identity only: no repo scope, provider tokens in storage, or browser keys.
// The numeric account ID is pinned to the repository's verified owner.
export const GITHUB_OWNER = { id: 87021168, login: 'iam-ajmunna' };
const FLOW_COOKIE = '__Host-aj-github-flow', SESSION_COOKIE = '__Host-aj-feedback-admin';
const FLOW_TTL = 600, SESSION_TTL = 3600;
export class AdminAuthError extends Error {
  constructor(message, status = 401) { super(message); this.status = status; }
}
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
function cookieValue(request, name) {
  const header = request.headers.get('cookie') || '';
  if (header.length > 8000) return null;
  const values = header.split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'='));
  return values.length === 1 ? values[0].slice(name.length+1) : null;
}
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function redirect(to, cookies = []) {
  const headers = new Headers({Location:to,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  cookies.forEach(value=>headers.append('Set-Cookie',value));
  return new Response(null,{status:303,headers});
}
async function signingKey(secret) {
  return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}

export function createGithubAuth({ fetcher = fetch, now = Date.now } = {}) {
  const enabled = env => env.ADMIN_AUTH_PROVIDER === 'github' || Boolean(env.GITHUB_CLIENT_ID || env.GITHUB_CLIENT_SECRET);
  const configured = env => Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.ADMIN_SESSION_SECRET?.length >= 32);
  function config(env, origin) {
    if (!configured(env) || !env.BUCKET) throw new AdminAuthError('GitHub sign-in needs its one-time owner setup.',503);
    const callback = new URL(env.GITHUB_REDIRECT_URI || '/auth/github/callback',origin);
    if (callback.origin !== origin || callback.pathname !== '/auth/github/callback' || callback.search || callback.hash || callback.protocol !== 'https:')
      throw new AdminAuthError('GitHub sign-in needs its callback setting corrected.',503);
    return callback.href;
  }
  async function provider(url, options = {}) {
    const aborter = new AbortController(), timer = setTimeout(()=>aborter.abort(),10_000);
    try {
      const result = await fetcher(url,{...options,signal:aborter.signal});
      if (!result.ok) throw new AdminAuthError('GitHub could not verify this sign-in. Try signing in again.',502);
      const data = await result.json();
      if (!data || data.error) throw new AdminAuthError('GitHub did not complete sign-in. Try signing in again.',401);
      return data;
    } catch (error) {
      if (error instanceof AdminAuthError) throw error;
      throw new AdminAuthError('GitHub could not be reached. Try signing in again.',502);
    } finally { clearTimeout(timer); }
  }
  async function begin(request, env) {
    const origin = new URL(request.url).origin, callback = config(env,origin);
    const flow = {state:random(),verifier:random(),expires:now()+FLOW_TTL*1000,callback};
    const payload = encode(new TextEncoder().encode(JSON.stringify(flow)));
    const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env.ADMIN_SESSION_SECRET),new TextEncoder().encode(payload))));
    const url = new URL('https://github.com/login/oauth/authorize');
    for (const [key,value] of Object.entries({client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,login:GITHUB_OWNER.login,scope:'',state:flow.state,code_challenge:await digest(flow.verifier),code_challenge_method:'S256',allow_signup:'false',prompt:'select_account'})) url.searchParams.set(key,value);
    return redirect(url.href,[cookie(FLOW_COOKIE,payload+'.'+signature,FLOW_TTL)]);
  }
  async function callback(request, env) {
    const url = new URL(request.url), callbackURL = config(env,url.origin);
    const signed = cookieValue(request,FLOW_COOKIE);
    if (!signed || signed.length > 1500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(signed))
      throw new AdminAuthError('This sign-in expired. Start again from the admin page.');
    const [payload,signature] = signed.split('.');
    let flow;
    try {
      const valid = await crypto.subtle.verify('HMAC',await signingKey(env.ADMIN_SESSION_SECRET),decode(signature),new TextEncoder().encode(payload));
      if (!valid) throw new Error('Invalid signature');
      flow = JSON.parse(new TextDecoder().decode(decode(payload)));
    } catch { throw new AdminAuthError('This sign-in could not be verified. Start again from the admin page.'); }
    if (flow.callback !== callbackURL || !Number.isFinite(flow.expires) || flow.expires <= now() || flow.expires > now()+FLOW_TTL*1000 ||
        !/^[A-Za-z0-9_-]{43}$/.test(flow.state || '') || !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier || '') || url.searchParams.get('state') !== flow.state)
      throw new AdminAuthError('This sign-in expired or changed. Start again from the admin page.');
    const code = url.searchParams.get('code');
    if (url.searchParams.get('error') || !code || code.length > 200 || !/^[A-Za-z0-9_-]+$/.test(code))
      throw new AdminAuthError('GitHub sign-in was cancelled. Start again when you are ready.');
    const token = await provider('https://github.com/login/oauth/access_token',{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:callbackURL,code_verifier:flow.verifier}),
    });
    if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 4096 || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer')
      throw new AdminAuthError('GitHub did not confirm this sign-in. Start again.');
    const user = await provider('https://api.github.com/user',{
      headers:{Authorization:'Bearer '+token.access_token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AJ-Comics-Admin'},
    });
    if (user.id !== GITHUB_OWNER.id || typeof user.login !== 'string' || user.login.toLowerCase() !== GITHUB_OWNER.login)
      throw new AdminAuthError('Only @iam-ajmunna can manage this feedback. Sign in with that GitHub account.',403);
    const session = random(), key = 'admin-sessions/'+await digest(session);
    const stored = await env.BUCKET.put(key,JSON.stringify({githubId:user.id,login:GITHUB_OWNER.login,expires:now()+SESSION_TTL*1000}),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if (!stored) throw new AdminAuthError('Admin sign-in could not be saved. Start again.',503);
    // Successful GitHub codes are single-use; clear the flow cookie immediately.
    // Provider tokens are discarded and never become the admin session cookie.
    return redirect('/admin',[cookie(FLOW_COOKIE,'',0),cookie(SESSION_COOKIE,session,SESSION_TTL)]);
  }
  async function requireSession(request, env) {
    config(env,new URL(request.url).origin);
    const value = cookieValue(request,SESSION_COOKIE);
    if (!/^[A-Za-z0-9_-]{43}$/.test(value || '')) throw new AdminAuthError('Sign in with GitHub to manage feedback.');
    const stored = await env.BUCKET.get('admin-sessions/'+await digest(value));
    const record = stored ? await stored.json() : null;
    if (!record || !Number.isFinite(record.expires) || record.expires <= now() || record.expires > now()+SESSION_TTL*1000 || record.githubId !== GITHUB_OWNER.id || record.login !== GITHUB_OWNER.login)
      throw new AdminAuthError('Your admin session expired. Sign in with GitHub again.');
    return {userId:'github:'+record.githubId,login:record.login,provider:'github',role:'admin'};
  }
  async function logout(request, env) {
    const origin = new URL(request.url).origin;
    if (request.headers.get('origin') !== origin) throw new AdminAuthError('Use the admin panel to sign out.',403);
    const value = cookieValue(request,SESSION_COOKIE);
    if (/^[A-Za-z0-9_-]{43}$/.test(value || '') && env.BUCKET) await env.BUCKET.delete('admin-sessions/'+await digest(value));
    return redirect('/admin',[cookie(SESSION_COOKIE,'',0),cookie(FLOW_COOKIE,'',0)]);
  }
  return {enabled,configured,begin,callback,requireSession,logout};
}
