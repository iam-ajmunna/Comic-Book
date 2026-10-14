// One-time owner setup. Credentials remain encrypted in the private bucket;
// the encryption key is a Sites runtime secret, never an input or response.
import { AdminAuthError } from './github-auth.js';
const SETTINGS_KEY = 'admin-settings/github-oauth';
async function key(env) {
  if (!env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 32 || !env.BUCKET)
    throw new AdminAuthError('GitHub setup is temporarily unavailable. Ask AJ to check its server configuration.',503);
  return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.ADMIN_SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export function validateGithubSettings(value) {
  const clientId = typeof value?.clientId === 'string' ? value.clientId.trim() : '';
  const clientSecret = typeof value?.clientSecret === 'string' ? value.clientSecret.trim() : '';
  if (!/^[A-Za-z0-9_.-]{8,120}$/.test(clientId)) { const error=new AdminAuthError('Enter the Client ID from your GitHub OAuth app.',422);error.field='clientId';throw error; }
  if (!/^[A-Za-z0-9_.-]{20,256}$/.test(clientSecret)) { const error=new AdminAuthError('Enter the Client secret from your GitHub OAuth app.',422);error.field='clientSecret';throw error; }
  return {clientId,clientSecret};
}
export async function resolveGithubSettings(env, origin) {
  if (env.GITHUB_CLIENT_ID || env.GITHUB_CLIENT_SECRET || !env.BUCKET) return env;
  const stored = await env.BUCKET.get(SETTINGS_KEY); if (!stored) return env;
  try {
    const value=await stored.json();
    if (!Array.isArray(value.iv) || value.iv.length!==12 || !Array.isArray(value.data) || value.data.length>1024) throw new Error('Invalid settings');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv),additionalData:new TextEncoder().encode(origin)},await key(env),new Uint8Array(value.data));
    const settings=validateGithubSettings(JSON.parse(new TextDecoder().decode(plain)));
    return {...env,GITHUB_CLIENT_ID:settings.clientId,GITHUB_CLIENT_SECRET:settings.clientSecret};
  } catch { throw new AdminAuthError('GitHub sign-in settings could not be opened. The owner needs to save them again.',503); }
}
export async function githubSettingsStatus(env,origin) {
  await key(env);
  const stored=await env.BUCKET.get(SETTINGS_KEY);
  return {configured:Boolean((env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) || stored),version:stored?.etag || null,callback:origin+'/auth/github/callback'};
}
export async function saveGithubSettings(env, origin, value) {
  if (env.GITHUB_CLIENT_ID || env.GITHUB_CLIENT_SECRET) throw new AdminAuthError('GitHub credentials are managed in server settings for this deployment.',409);
  const settings=validateGithubSettings(value),encryptionKey=await key(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const previous=await env.BUCKET.get(SETTINGS_KEY);
  if (previous) {
    try { const current=await resolveGithubSettings(env,origin);if (current.GITHUB_CLIENT_ID===settings.clientId && current.GITHUB_CLIENT_SECRET===settings.clientSecret) return; } catch { /* Owner setup can replace unreadable settings. */ }
  }
  if ((value.version ?? null) !== (previous?.etag || null)) throw new AdminAuthError('The settings changed. Refresh this setup page before trying again.',409);
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(origin)},encryptionKey,new TextEncoder().encode(JSON.stringify(settings)));
  const saved=await env.BUCKET.put(SETTINGS_KEY,JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(data))}),{
    onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},
  });
  if (!saved) throw new AdminAuthError('The settings changed. Refresh this setup page before trying again.',409);
}
