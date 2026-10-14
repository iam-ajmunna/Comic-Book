import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import worker, { validateFeedback, createWorker } from '../feedback-service/worker/index.js';

// Implements the R2 operations the real service uses, including conditional
// writes. Integration tests never publish invented reader feedback.
export class MemoryBucket {
  data = new Map(); serial = 0;
  async get(key) {
    const value = this.data.get(key);
    return value ? { key, etag: value.etag, json: async () => JSON.parse(value.body) } : null;
  }
  async put(key, body, options = {}) {
    const old = this.data.get(key), condition = options.onlyIf;
    if (condition?.etagDoesNotMatch === '*' && old) return null;
    if (condition?.etagMatches && old?.etag !== condition.etagMatches) return null;
    const etag = String(++this.serial); this.data.set(key, { body, etag }); return { key, etag };
  }
  async list({ prefix, limit = 12, cursor = '' }) {
    const keys = [...this.data.keys()].filter(k => k.startsWith(prefix) && k > cursor).sort();
    const page = keys.slice(0, limit), truncated = keys.length > limit;
    return { objects: page.map(key => ({ key })), truncated, cursor: truncated ? page.at(-1) : undefined };
  }
}

const origin = 'https://iam-ajmunna.github.io';
export const draft = (extra = {}) => ({ id: `${Date.now()}-${randomUUID()}`, name: 'A reader', text: 'That ending stayed with me.', photo: null, book: 'multiversal-love', edition: 'revised-80-v1', ...extra });
const environment = () => ({ BUCKET: new MemoryBucket(), RATE_LIMIT_SECRET: 'isolated-test-only-salt' });
const post = (value, ip = '192.0.2.1') => new Request('https://feedback.example/api/feedback', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(value) });
const list = (params = '') => new Request(`https://feedback.example/api/feedback?book=multiversal-love&edition=revised-80-v1${params}`, { headers: { Origin: origin } });

test('public service requires a name and feedback, while pictures are optional', async () => {
  const env = environment();
  const invalid = await worker.fetch(post(draft({ name: '   ' })), env);
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).field, 'name');
  assert.equal(env.BUCKET.data.size, 0);
  const value = draft({ name: '  মুনা  ', text: '<script>Just text</script>' });
  const result = await worker.fetch(post(value), env);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('access-control-allow-origin'), origin);
  const review = (await result.json()).review;
  assert.equal(review.name, 'মুনা'); assert.equal(review.text, '<script>Just text</script>'); assert.equal(review.photo, null);
  const secondReader = await worker.fetch(list(), env);
  assert.equal((await secondReader.json()).reviews[0].id, value.id, 'a different reader sees the confirmed shared record');
});

test('retrying the same anonymous post does not create duplicates or replace content', async () => {
  const env = environment(), value = draft();
  assert.equal((await worker.fetch(post(value), env)).status, 201);
  const repeated = await worker.fetch(post(value), env);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).review.id, value.id);
  assert.equal((await (await worker.fetch(list(), env)).json()).reviews.length, 1);
  assert.equal((await worker.fetch(post({ ...value, text: 'Changed using the same identifier.' }), env)).status, 409);
  assert.equal((await worker.fetch(post(draft()), env)).status, 429);
});

test('service rejects unsafe pictures, oversized requests, invalid books and foreign origins', async () => {
  const env = environment();
  for (const photo of ['https://tracking.example/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YWJjZA=='])
    assert.throws(() => validateFeedback(draft({ photo })), e => e.field === 'photo');
  assert.equal((await worker.fetch(post(draft({ book: '../limits' })), env)).status, 422);
  const huge = post(draft({ text: 'x'.repeat(120_000) }));
  assert.equal((await worker.fetch(huge, env)).status, 413);
  const foreign = new Request(list().url, { headers: { Origin: 'https://other.example' } });
  assert.equal((await worker.fetch(foreign, env)).status, 403);
  const preflight = await worker.fetch(new Request(list().url, { method: 'OPTIONS', headers: { Origin: origin } }), env);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await worker.fetch(new Request(list().url, { method: 'DELETE' }), env)).status, 405);
});

test('shared feed paginates newest first and separates comic editions', async () => {
  const env = environment(), now = Date.now();
  for (let i = 0; i < 14; i++) {
    const value = draft({ id: `${now - i * 1000}-${randomUUID()}`, name: `Reader ${i}` });
    assert.equal((await worker.fetch(post(value, `192.0.2.${i + 1}`), env)).status, 201);
  }
  const first = await (await worker.fetch(list(), env)).json();
  assert.equal(first.reviews.length, 12); assert.equal(first.reviews[0].name, 'Reader 0'); assert.ok(first.cursor);
  const next = await (await worker.fetch(list(`&cursor=${encodeURIComponent(first.cursor)}`), env)).json();
  assert.equal(next.reviews.length, 2); assert.equal(next.cursor, null);
  const other = new Request('https://feedback.example/api/feedback?book=multiversal-love&edition=v2');
  assert.equal((await (await worker.fetch(other, env)).json()).reviews.length, 0);
});

test('missing storage or network identity fails honestly without saving feedback', async () => {
  const env = environment();
  assert.equal((await worker.fetch(post(draft()), {})).status, 503);
  const missing = post(draft()); missing.headers.delete('cf-connecting-ip');
  assert.equal((await worker.fetch(missing, env)).status, 503);
  assert.equal(env.BUCKET.data.size, 0);
});

// Synthetic one-pixel JPEG fixture; no reader or creator picture is uploaded.
const tinyJPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDHooor0jgP/9k=';
test('optional pictures are stored with feedback and oversized frames are rejected', async () => {
  const env = environment(), value = draft({ photo: tinyJPEG });
  const result = await worker.fetch(post(value), env);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).review.photo, tinyJPEG);
  const publicFeed = await (await worker.fetch(list(), env)).json();
  assert.equal(publicFeed.reviews[0].photo, tinyJPEG);
  const bytes = Buffer.from(tinyJPEG.split(',')[1], 'base64');
  const frame = bytes.indexOf(Buffer.from([255, 192]));
  assert.ok(frame > 0);
  bytes.writeUInt16BE(4096, frame + 7);
  assert.throws(() => validateFeedback(draft({ photo: 'data:image/jpeg;base64,' + bytes.toString('base64') })), e => e.field === 'photo');
});

const ownerEmail = 'owner@example.invalid';
const adminEnv = () => ({...environment(),ADMIN_EMAIL:ownerEmail});
const adminRequest = (path='/api/admin/feedback',method='GET',body,extra={}) => new Request('https://feedback.example'+path,{
  method, headers:{'Origin':'https://feedback.example','oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':ownerEmail,...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),
});
const adminPath = value => '/api/admin/feedback/'+encodeURIComponent(value.id)+'?book='+value.book+'&edition='+encodeURIComponent(value.edition);
async function ownerRow(env) { return (await (await worker.fetch(adminRequest(),env)).json()).reviews[0]; }

test('admin API rejects anonymous visitors, other accounts and frontend role claims',async()=>{
  const env=adminEnv();
  assert.equal((await worker.fetch(new Request('https://feedback.example/api/admin/feedback'),env)).status,401);
  const fake=new Request('https://feedback.example/api/admin/feedback',{headers:{'x-admin-role':'admin','Authorization':'Bearer not-an-admin-session'}});
  assert.equal((await worker.fetch(fake,env)).status,401);
  assert.equal((await worker.fetch(adminRequest('/api/admin/session','GET',undefined,{'oai-authenticated-user-email':'someone@example.invalid'}),env)).status,403);
  assert.equal((await worker.fetch(adminRequest('/api/admin/session'),{...env,ADMIN_EMAIL:''})).status,403);
  assert.equal((await worker.fetch(adminRequest('/api/admin/session'),{...env,ADMIN_USER_ID:'different-owner'})).status,403);
  const owner=await worker.fetch(adminRequest('/api/admin/session'),env); assert.equal(owner.status,200); assert.equal((await owner.json()).role,'admin');
  assert.equal(env.BUCKET.data.size,0,'permission checks never write records');
});

test('owner dashboard is protected and uses a real platform sign-in link',async()=>{
  const dashboard=createWorker({html:'<main id="admin-list">Owner controls</main>',css:'.admin-main{}',js:'export const ready=true;'});
  const anon=await dashboard.fetch(new Request('https://feedback.example/admin'),adminEnv());
  assert.equal(anon.status,401); const text=await anon.text(); assert.match(text,/signin-with-chatgpt\?return_to=%2Fadmin/); assert.doesNotMatch(text,/admin-list|owner@example/);
  const wrong=await dashboard.fetch(adminRequest('/admin','GET',undefined,{'oai-authenticated-user-email':'another@example.invalid'}),adminEnv()); assert.equal(wrong.status,403);
  const owner=await dashboard.fetch(adminRequest('/admin'),adminEnv()); assert.equal(owner.status,200); assert.match(await owner.text(),/Owner controls/);
  assert.match(owner.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.equal(owner.headers.get('Cache-Control'),'no-store');
  assert.equal((await dashboard.fetch(new Request('https://feedback.example/admin/app.js'),adminEnv())).status,401);
});

test('owner can delete and restore feedback; public retries cannot republish a deleted post',async()=>{
  const env=adminEnv(),value=draft(); await worker.fetch(post(value),env);
  const row=await ownerRow(env); assert.equal(row.book,value.book); assert.ok(row.version);
  const removed=await worker.fetch(adminRequest(adminPath(value),'DELETE',{version:row.version}),env);
  assert.equal(removed.status,200); const deleted=(await removed.json()).review; assert.ok(deleted.deleted_at);
  assert.equal((await (await worker.fetch(list(),env)).json()).reviews.length,0);
  assert.equal((await worker.fetch(post(value),env)).status,410);
  const active=await (await worker.fetch(adminRequest(),env)).json(); assert.equal(active.reviews.length,0);
  const trash=await (await worker.fetch(adminRequest('/api/admin/feedback?status=deleted'),env)).json(); assert.equal(trash.reviews[0].text,value.text);
  assert.equal((await worker.fetch(adminRequest(adminPath(value),'DELETE',{version:row.version}),env)).status,200,'delete retries are idempotent');
  const restored=await worker.fetch(adminRequest(adminPath(value),'POST',{version:deleted.version,action:'restore'}),env); assert.equal(restored.status,200);
  assert.equal((await (await worker.fetch(list(),env)).json()).reviews[0].id,value.id);
});

test('owner can add, replace and remove a picture without changing name/text or breaking reader retries',async()=>{
  const env=adminEnv(),value=draft(); await worker.fetch(post(value),env); const row=await ownerRow(env);
  const added=await worker.fetch(adminRequest(adminPath(value),'PATCH',{version:row.version,photo:tinyJPEG}),env);
  assert.equal(added.status,200); const updated=(await added.json()).review;
  assert.equal(updated.photo,tinyJPEG); assert.equal(updated.name,value.name); assert.equal(updated.text,value.text);
  const publicRow=(await (await worker.fetch(list(),env)).json()).reviews[0];
  assert.equal(publicRow.photo,tinyJPEG); assert.equal(publicRow._moderated_by,undefined); assert.equal(publicRow._submission_hash,undefined); assert.equal(publicRow.version,undefined);
  assert.equal((await worker.fetch(post(value),env)).status,200,'the original reader submission remains safely retryable');
  assert.equal((await worker.fetch(adminRequest(adminPath(value),'PATCH',{version:row.version,photo:tinyJPEG}),env)).status,200,'picture retries do not write twice');
  const stale=await worker.fetch(adminRequest(adminPath(value),'PATCH',{version:row.version,photo:null}),env); assert.equal(stale.status,409);
  const cleared=await worker.fetch(adminRequest(adminPath(value),'PATCH',{version:updated.version,photo:null}),env); assert.equal(cleared.status,200); assert.equal((await cleared.json()).review.photo,null);
});

test('moderation checks origin, version, namespace and picture constraints before writes',async()=>{
  const env=adminEnv(),value=draft(); await worker.fetch(post(value),env); const row=await ownerRow(env);
  const external=await worker.fetch(adminRequest(adminPath(value),'DELETE',{version:row.version},{Origin:'https://other.example'}),env); assert.equal(external.status,403);
  const missingOrigin=adminRequest(adminPath(value),'DELETE',{version:row.version}); missingOrigin.headers.delete('origin'); assert.equal((await worker.fetch(missingOrigin,env)).status,403);
  assert.equal((await worker.fetch(adminRequest(adminPath(value),'DELETE',{version:'stale'}),env)).status,409);
  assert.equal((await worker.fetch(adminRequest(adminPath(value),'PATCH',{version:row.version}),env)).status,422);
  const invalid=await worker.fetch(adminRequest(adminPath(value),'PATCH',{version:row.version,photo:'https://other.example/picture.jpg'}),env); assert.equal(invalid.status,422); assert.equal((await invalid.json()).field,'photo');
  const escaped=adminPath(value).replace('book=multiversal-love','book=../limits'); assert.equal((await worker.fetch(adminRequest(escaped,'DELETE',{version:row.version}),env)).status,422);
  assert.equal((await (await worker.fetch(list(),env)).json()).reviews[0].photo,null);
  assert.equal((await ownerRow(env)).version,row.version,'failed mutations leave the stored record unchanged');
});
