import { preparePhoto } from 'https://iam-ajmunna.github.io/Comic-Book/src/feedback-photo.js?v=20261014-2';
import { validPhotoData } from 'https://iam-ajmunna.github.io/Comic-Book/src/feedback-api.js?v=20261014-2';
const $ = id => document.getElementById(id);
const dialog = $('admin-dialog'), list = $('admin-list');
let filter = new URLSearchParams(location.search).get('status') === 'deleted' ? 'deleted' : 'active';
let cursor = null, loading = false, loadGeneration = 0, loadAborter, actionGeneration = 0;
let authorized = false;
let target = null, trigger = null, action = null, saving = false, preparing = false, photo = null, photoName = '', photoError = '';
const rendered = new Map(), pictureDrafts = new Map();
const identityKey = row => [row.book, row.edition, row.id].join(':');

async function api(path, options = {}) {
  const { aborter = new AbortController(), ...requestOptions } = options;
  const timer = setTimeout(() => aborter.abort(), 20_000);
  try {
    const result = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...requestOptions, signal: aborter.signal });
    const data = await result.json();
    if (!result.ok) { const error = new Error(data.error || 'Feedback couldn’t be updated. Try again.'); error.status = result.status; error.field = data.field; throw error; }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Couldn’t confirm the request in time. Retry the same action safely.');
    if (e instanceof TypeError) throw new Error('Couldn’t reach feedback. Check your connection and try again.');
    throw e;
  } finally { clearTimeout(timer); }
}
function sessionError(node, error) {
  node.textContent = error.message;
  if (error.status === 401) {
    const link = document.createElement('a'); link.href = '/admin'; link.target = '_top'; link.textContent = ' Sign in again'; node.append(link);
  }
}
function button(label, fn, className = 'button ghost') {
  const node = document.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label;
  node.addEventListener('click', () => fn(node)); return node;
}
function renderCard(row) {
  const card = document.createElement('article'); card.className = 'comment-card';
  const header = document.createElement('header'), byline = document.createElement('div'); byline.className = 'comment-byline';
  const initials = document.createElement('span'); initials.className = 'comment-avatar'; initials.setAttribute('aria-hidden','true'); initials.textContent = Array.from(row.name || '?')[0].toUpperCase();
  if (validPhotoData(row.photo)) {
    const image = new Image(); image.className = 'comment-avatar'; image.alt = ''; image.width = image.height = 48; image.loading = 'lazy'; image.decoding = 'async'; image.src = row.photo;
    image.addEventListener('error', () => image.replaceWith(initials), {once:true}); header.append(image);
  } else header.append(initials);
  const name = document.createElement('strong'); name.textContent = row.name;
  const date = document.createElement('time'); date.dateTime = row.created_at; const time = new Date(row.created_at);
  date.textContent = Number.isNaN(time.valueOf()) ? '' : new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(time);
  byline.append(name,date); header.append(byline);
  const book = document.createElement('p'); book.className = 'admin-review-book'; book.textContent = row.book + ' · ' + row.edition;
  const text = document.createElement('p'); text.textContent = row.text;
  const controls = document.createElement('div'); controls.className = 'admin-card-actions';
  if (row.deleted_at) controls.append(button('Restore feedback',node => openAction(row,'restore',node)));
  else {
    controls.append(button(row.photo ? 'Replace picture' : 'Add picture',node => openAction(row,'picture',node)));
    if (row.photo) controls.append(button('Remove picture',node => openAction(row,'remove_picture',node)));
    controls.append(button('Delete feedback',node => openAction(row,'delete',node),'button admin-delete'));
  }
  card.append(header,book,text,controls); return card;
}
function add(row) {
  const key = identityKey(row), existing = rendered.get(key), card = renderCard(row);
  if (existing) existing.card.replaceWith(card); else list.append(card);
  rendered.set(key,{row,card});
}
function setListBusy(busy) {
  $('admin-refresh').disabled = $('admin-more').disabled = busy;
  list.setAttribute('aria-busy',String(busy));
  list.querySelectorAll('button').forEach(node => { node.disabled = busy; });
}
async function load(reset = false) {
  if (loading && !reset) return;
  loadAborter?.abort(); loadAborter = new AbortController();
  const request = ++loadGeneration; loading = true;
  setListBusy(true); $('admin-status').textContent = 'Loading feedback…';
  const url = new URL('/api/admin/feedback',location.origin); url.searchParams.set('status',filter); if (!reset && cursor) url.searchParams.set('cursor',cursor);
  try {
    const data = await api(url.href,{aborter:loadAborter});
    if (request !== loadGeneration) return;
    if (reset) { list.replaceChildren(); rendered.clear(); }
    data.reviews.forEach(add); cursor = data.cursor || null; $('admin-more').hidden = !cursor;
    $('admin-empty').hidden = rendered.size > 0 || Boolean(cursor);
    $('admin-status').textContent = rendered.size ? rendered.size + ' feedback posts loaded.' : cursor ? 'More feedback is available. Load more to continue.' : '';
  } catch (e) { if (request === loadGeneration) sessionError($('admin-status'),e); }
  finally { if (request === loadGeneration) { loading = false; setListBusy(false); } }
}
function updateAction() {
  $('admin-action-save').disabled = saving || preparing || Boolean(photoError) || (action === 'picture' && !photo);
  $('admin-action-cancel').disabled = $('admin-dialog-close').disabled = saving;
  $('admin-picture').disabled = saving; $('admin-picture-clear').disabled = saving;
  $('admin-action-save').textContent = saving ? 'Saving…' : action === 'delete' ? 'Delete feedback' : action === 'restore' ? 'Restore feedback' : action === 'remove_picture' ? 'Remove picture' : 'Save picture';
  $('admin-action-form').setAttribute('aria-busy',String(saving || preparing));
  $('admin-picture-error').textContent = photoError; $('admin-picture-error').hidden = !photoError;
  $('admin-picture').setAttribute('aria-invalid',String(Boolean(photoError)));
  $('admin-picture-selection').hidden = !(photo || photoName || preparing || photoError);
  $('admin-picture-preview').hidden = !photo;
  if (photo) $('admin-picture-preview').src = photo; else $('admin-picture-preview').removeAttribute('src');
  $('admin-picture-name').textContent = photoName;
}
function openAction(row, kind, node) {
  if (!authorized || loading || saving || dialog.open) return;
  actionGeneration++; target = row; trigger = node; action = kind; saving = preparing = false;
  const draft = pictureDrafts.get(identityKey(row)); photo = draft?.photo || null; photoName = draft?.name || ''; photoError = '';
  $('admin-picture').value = ''; $('admin-action-status').textContent = '';
  $('admin-picture-fields').hidden = kind !== 'picture';
  $('admin-dialog-title').textContent = kind === 'delete' ? 'Delete feedback' : kind === 'restore' ? 'Restore feedback' : 'Profile picture';
  $('admin-action-message').textContent = kind === 'delete' ? 'Delete feedback from ' + row.name + '? It will leave the public carousel. You can restore it from Deleted.' : kind === 'restore' ? 'Restore feedback from ' + row.name + ' to the public carousel?' : kind === 'remove_picture' ? 'Remove the picture from ' + row.name + '’s feedback? Their name and comment stay published.' : 'Add or replace the profile picture on ' + row.name + '’s feedback.';
  updateAction(); dialog.showModal();
  (kind === 'picture' ? $('admin-picture') : $('admin-action-cancel')).focus();
}
function closeAction() { if (!saving) dialog.close(); }
$('admin-action-cancel').addEventListener('click',closeAction); $('admin-dialog-close').addEventListener('click',closeAction);
dialog.addEventListener('cancel',event => { if (saving) event.preventDefault(); });
dialog.addEventListener('close',() => {
  if (target && action === 'picture') pictureDrafts.set(identityKey(target),{photo,name:photoName});
  actionGeneration++; preparing = false;
  if (trigger?.isConnected) trigger.focus(); else $('admin-refresh').focus();
});
$('admin-picture').addEventListener('change',async () => {
  const file = $('admin-picture').files?.[0]; if (!file) return;
  const request = ++actionGeneration; preparing = true; photoError = ''; photoName = file.name; updateAction(); $('admin-action-status').textContent = 'Preparing the picture…';
  try {
    const result = await preparePhoto(file); if (request !== actionGeneration) return;
    if (!validPhotoData(result)) throw new Error('This picture couldn’t be prepared. Choose another.');
    photo = result; $('admin-action-status').textContent = 'Picture ready. Save to publish it.';
  } catch (e) { if (request === actionGeneration) { photoError = e.message; $('admin-action-status').textContent = ''; } }
  finally { if (request === actionGeneration) { preparing = false; $('admin-picture').value = ''; updateAction(); } }
});
$('admin-picture-clear').addEventListener('click',() => { actionGeneration++; preparing = false; photo = null; photoName = ''; photoError = ''; $('admin-picture').value = ''; $('admin-action-status').textContent = ''; updateAction(); $('admin-picture').focus(); });
$('admin-action-form').addEventListener('submit',async event => {
  event.preventDefault(); if (!target || saving || preparing || photoError || (action === 'picture' && !photo)) return;
  const row = target, kind = action; saving = true; updateAction(); $('admin-action-status').textContent = 'Saving the change…';
  const url = new URL('/api/admin/feedback/'+encodeURIComponent(row.id),location.origin); url.searchParams.set('book',row.book); url.searchParams.set('edition',row.edition);
  const method = kind === 'delete' ? 'DELETE' : kind === 'restore' ? 'POST' : 'PATCH';
  const body = {version:row.version}; if (kind === 'restore') body.action = 'restore'; if (kind === 'picture' || kind === 'remove_picture') body.photo = kind === 'picture' ? photo : null;
  try {
    const data = await api(url.href,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (kind === 'delete' || kind === 'restore') { const entry = rendered.get(identityKey(row)); entry?.card.remove(); rendered.delete(identityKey(row)); }
    else add(data.review);
    pictureDrafts.delete(identityKey(row)); photo = null; photoName = ''; saving = false; dialog.close();
    $('admin-status').textContent = kind === 'delete' ? 'Feedback deleted. You can restore it from Deleted.' : kind === 'restore' ? 'Feedback restored to the public carousel.' : 'Profile picture updated.';
    $('admin-empty').hidden = rendered.size > 0 || Boolean(cursor);
  } catch (e) { if (e.field === 'photo') photoError = e.message; sessionError($('admin-action-status'),e); }
  finally { saving = false; updateAction(); }
});
function changeFilter(value) {
  if (value !== filter) { list.replaceChildren(); rendered.clear(); cursor = null; $('admin-more').hidden = $('admin-empty').hidden = true; }
  filter = value; const url = new URL(location.href); url.searchParams.set('status',filter); history.replaceState(null,'',url);
  $('show-active').setAttribute('aria-pressed',String(filter === 'active')); $('show-deleted').setAttribute('aria-pressed',String(filter === 'deleted')); load(true);
}
$('show-active').addEventListener('click',() => changeFilter('active')); $('show-deleted').addEventListener('click',() => changeFilter('deleted'));
$('admin-refresh').addEventListener('click',() => authorized ? load(true) : start()); $('admin-more').addEventListener('click',() => { if (cursor) load(); });
async function start() {
  $('admin-refresh').disabled = true;
  try {
    const session = await api('/api/admin/session'); authorized = true;
    $('admin-identity').textContent = session.provider === 'github' ? 'Signed in as @'+session.login+' · GitHub administrator' : 'Current owner access · GitHub sign-in pending activation';
    $('github-setup-note').hidden = session.provider === 'github';
    $('admin-identity').dataset.userId = session.userId;
    $('show-active').disabled = $('show-deleted').disabled = false;
    changeFilter(filter);
  } catch (e) {
    sessionError($('admin-status'),e); $('admin-identity').textContent = 'Owner access required'; $('admin-refresh').disabled = false;
  }
}
start();
