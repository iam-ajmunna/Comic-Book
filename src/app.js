import { validateCatalog, fetchJson } from './catalog.js?v=20261010-2';
import { validPage, normalizeState, visitedFor, isComplete, nextUnread, spreadForPage, turnPage, readSaved, persist, storageKey, pageFromHash } from './state.js?v=20261010-2';
import { $, el, announce, initDialogs, openDialog, idleControls, readPreferences, savePreferences } from './ui.js?v=20261010-2';
import { PageImages } from './images.js?v=20261010-2';
import { AmbientLight } from './lighting.js?v=20261010-2';
import { flipSpread, cancelFlip } from './flip.js?v=20261010-2';
import { initZoom } from './zoom.js?v=20261010-2';
import { initComments } from './comments.js?v=20261010-2';
import { initAmbience } from './ambience.js?v=20261010-2';
import { initOffline } from './offline.js?v=20261010-2';
import { attachSwipe } from './swipe.js?v=20261010-2';
import { initFullscreen } from './fullscreen.js?v=20261010-2';

let storage = null;
try { storage = window.localStorage; } catch { /* Reading works with memory-only progress. */ }
const preferences = readPreferences(storage);
const images = new PageImages();
const lighting = new AmbientLight($('ambient'));
const narrow = matchMedia('(max-width:680px)');
const reduced = matchMedia('(prefers-reduced-motion:reduce)');
const stage = $('book-stage');
const revealControls = idleControls($('reader'));
const fullscreen = initFullscreen($('reading-view'), $('fullscreen-button'), $('fullscreen-icon'), { announce, reveal: revealControls });
const zoom = initZoom(images);
const setAmbience = initAmbience();
if (Number.isFinite(preferences.volume)) {
  $('volume').value = Math.max(0, Math.min(35, preferences.volume));
  $('volume').dispatchEvent(new Event('input'));
}
$('volume').addEventListener('input', () => { preferences.volume = Number($('volume').value); savePreferences(storage, preferences); });
const offline = initOffline();
// Keep active download state when search or cross-tab progress rebuilds the shelf.
const downloads = new Map();
const transcripts = new Map();
let comics = [], book = null, current = 0, state = { page: 0, visited: [] };
let textMode = false, layoutOverride = null, generation = 0, turning = false;
let comments, visible = new Map(), lastSize = '', composing = false;
let search = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
let openedReviewBook = null;
const single = () => layoutOverride === null ? narrow.matches : layoutOverride;
const shownPages = () => single() ? [current] : spreadForPage(current, book.pages.length);
const inReader = () => book && !$('reading-view').hidden;

initDialogs();
function save() {
  const result = persist(storage, { ...state, page: current }, book);
  state = result.state;
  $('storage-notice').hidden = result.ok;
}
function updateProgress() {
  if (!book) return;
  const total = book.pages.length, count = state.visited.length, complete = isComplete(state.visited, total);
  $('progress').max = total; $('progress').value = count;
  $('progress-label').textContent = `${count} / ${total} pages opened`;
  $('lock-count').textContent = `${total - count} ${total - count === 1 ? 'page' : 'pages'} left to open`;
  $('completion-message').textContent = `All ${total} pages opened. Welcome to the conversation.`;
  $('next-unread').hidden = complete;
  $('comments-locked').hidden = complete; $('comments-open').hidden = !complete;
  if (complete && comments && openedReviewBook !== book.id) {
    openedReviewBook = book.id; comments.refresh();
  }
  for (const item of $('contents-grid').children) {
    const id = Number(item.dataset.page), page = book.pages[id];
    if (!page) continue;
    const seen = state.visited.includes(id);
    item.setAttribute('aria-label', `${page.label}: ${page.title}, ${seen ? 'opened' : 'unread'}`);
    if (shownPages().includes(id)) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
    const label = item.querySelector('span');
    label.textContent = `${id ? 'Page ' : ''}${page.label}${seen ? ' ✓' : ''}`;
    label.classList.toggle('seen', seen);
  }
}
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) visible.set(entry.target, entry.isIntersecting && entry.intersectionRatio >= .3);
  checkOpened();
}, { threshold: [0, .3] });
function checkOpened() {
  if (!inReader() || turning || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
  const ids = [...visible].filter(([card, shown]) => shown && card.isConnected && card.dataset.ready === 'true').map(([card]) => Number(card.dataset.page));
  if (!ids.some((id) => !state.visited.includes(id))) return;
  state.visited = visitedFor(book.pages.length, state.visited, ids);
  save(); updateProgress();
}
function measure() {
  const host = $('book-host'), columns = single() ? 1 : 2;
  const width = Math.max(60, Math.min((host.clientWidth - 24) / columns, (host.clientHeight - 20) * book.width / book.height));
  stage.style.width = `${width * columns}px`;
  stage.style.height = `${width * book.height / book.width}px`;
  const edge = Math.max(0, (host.clientWidth - width * columns) / 2);
  $('edge-left').style.left = `${edge}px`; $('edge-right').style.right = `${edge}px`;
  return width;
}
function makeTranscript(page) {
  const article = el('article', 'transcript'); article.tabIndex = 0;
  article.setAttribute('aria-label', `${page.label} transcript`);
  article.append(el('h2', '', page.title));
  if (page.kind === 'cover') article.append(el('p', '', `${book.title}. ${book.description || ''}`));
  else if (page.kind === 'story') article.append(el('p', 'pdf-text', page.text));
  else if (page.panels?.length) for (const [index, panel] of page.panels.entries()) {
    article.append(el('h3', '', `Panel ${index + 1}`), el('p', 'panel-description', panel.description));
    for (const speech of panel.dialogue || []) {
      const line = el('p'); line.append(el('strong', '', `${speech.speaker}: `), document.createTextNode(speech.text)); article.append(line);
    }
  } else article.append(el('p', '', page.text || 'A text transcript is not available for this page.'));
  return article;
}
function loadTranscript(comic) {
  const key = `${comic.id}:${comic.edition}`;
  if (!transcripts.has(key)) {
    const promise = comic.transcript ? fetchJson(comic.transcript).then((data) => {
      if (!Array.isArray(data.pages) || data.pages.length !== comic.pages.length) throw new Error('The transcript does not match this edition.');
      return data.pages;
    }) : Promise.resolve(comic.pages);
    transcripts.set(key, promise);
    promise.catch(() => transcripts.delete(key));
  }
  return transcripts.get(key);
}
function makePage(id, width, ownGeneration, ownBook) {
  const page = ownBook.pages[id], card = el('div', 'page-shell');
  card.dataset.page = String(id); card.dataset.ready = 'false';
  card.setAttribute('role', 'group'); card.setAttribute('aria-label', `${page.label}: ${page.title}`);
  const loading = el('div', 'page-load'); loading.setAttribute('role', 'status');
  const mark = el('span', 'loading-mark'); mark.setAttribute('aria-hidden', 'true');
  loading.append(mark, el('p', '', `Opening ${id ? `page ${page.label}` : 'cover'}…`));
  card.append(loading);
  const work = (async () => {
    try {
      if (textMode) {
        const pages = await loadTranscript(ownBook);
        if (generation !== ownGeneration || !card.isConnected) return null;
        loading.remove(); card.append(makeTranscript({ ...page, ...pages[id] }));
        card.dataset.ready = 'true'; return null;
      }
      const image = await images.load(page, width, id === 0 ? 'high' : 'auto');
      if (generation !== ownGeneration || !card.isConnected) return null;
      const button = el('button', 'page-art'); button.type = 'button';
      button.setAttribute('aria-label', `Enlarge ${id ? `page ${page.label}` : 'cover'}`);
      const art = image.cloneNode(); art.width = ownBook.width; art.height = ownBook.height;
      art.alt = `${page.label} — ${page.title}. Use Read text for dialogue and descriptions.`;
      button.append(art); button.addEventListener('click', () => zoom(page, ownBook, button));
      loading.remove(); card.append(button); card.dataset.ready = 'true';
      return image;
    } catch (error) {
      if (generation !== ownGeneration || !card.isConnected) return null;
      loading.replaceChildren(el('p', '', textMode ? 'The transcript couldn’t open. Check your connection and retry.' : error.message));
      const retry = el('button', 'button', 'Retry page'); retry.type = 'button';
      retry.addEventListener('click', () => render()); loading.append(retry);
      return null;
    }
  })();
  return { card, work };
}
async function render({ animate = false, forward = true } = {}) {
  if (!inReader()) return;
  const own = ++generation, ownBook = book;
  cancelFlip(stage);
  const previous = [...stage.querySelectorAll(':scope > .page-shell:not(.empty-page)')];
  turning = true;
  observer.disconnect(); visible = new Map();
  const ids = shownPages(), rtl = book.readingDirection === 'rtl';
  stage.classList.toggle('single', single()); stage.classList.toggle('cover', current === 0);
  $('reader').classList.toggle('rtl', rtl); $('reader').classList.toggle('text-mode', textMode);
  stage.replaceChildren();
  const width = measure();
  let slots = single() ? ids : current === 0 ? [null, 0] : ids.length === 1 ? [ids[0], null] : ids;
  if (rtl && !single()) slots = [...slots].reverse();
  const works = [];
  for (const id of slots) {
    if (id === null) { const blank = el('div', 'page-shell empty-page'); blank.setAttribute('aria-hidden', 'true'); stage.append(blank); continue; }
    const { card, work } = makePage(id, width, own, ownBook); stage.append(card); observer.observe(card); works.push(work);
  }
  const page = book.pages[current], atEnd = ids.at(-1) === book.pages.length - 1;
  $('book-title').textContent = book.title; $('scene-title').textContent = page.title;
  const label = current === 0 ? 'Cover' : `Page${ids.length > 1 ? 's' : ''} ${ids.map((id) => book.pages[id].label).join(' – ')} / ${book.pages.length - 1}`;
  $('page-label').textContent = label;
  $('page-scrubber').max = book.pages.length - 1; $('page-scrubber').value = current;
  $('page-scrubber').setAttribute('aria-valuetext', label);
  $('previous').disabled = current === 0; $('next').disabled = atEnd;
  $('edge-left').disabled = rtl ? atEnd : current === 0; $('edge-right').disabled = rtl ? current === 0 : atEnd;
  $('edge-left').setAttribute('aria-label', rtl ? 'Next page' : 'Previous page');
  $('edge-right').setAttribute('aria-label', rtl ? 'Previous page' : 'Next page');
  $('layout-button').textContent = single() ? 'Two pages' : 'Single page';
  $('layout-button').setAttribute('aria-pressed', String(single()));
  $('text-button').textContent = textMode ? 'View artwork' : 'Read text'; $('text-button').setAttribute('aria-pressed', String(textMode));
  document.title = `${label} · ${page.title} — ${book.title}`;
  setAmbience(current, page.cue); updateProgress();
  const next = turnPage(current, 1, single(), book.pages.length);
  if (!textMode && next !== current) for (const id of single() ? [next] : spreadForPage(next, book.pages.length)) images.load(book.pages[id], width, 'low').catch(() => {});
  const loaded = await Promise.all(works);
  if (own !== generation) return;
  const palettes = await Promise.all(loaded.filter(Boolean).map((image) => lighting.sample(image)));
  if (own !== generation) return;
  lighting.show(palettes);
  if (animate && !textMode) await flipSpread(stage, previous, { forward, rtl, single: single() });
  if (own !== generation) return;
  turning = false; checkOpened();
}
function go(page, animate = false) {
  if (!book || !validPage(page, book.pages.length)) return;
  const forward = page > current; current = page;
  history.replaceState(null, '', `#read=${book.id}&page=${current}`);
  save(); revealControls(); render({ animate, forward });
}
function turn(direction) {
  if (!inReader()) return;
  const next = turnPage(current, direction, single(), book.pages.length);
  if (next !== current) go(next, true);
}
function firstUnread() { go(nextUnread(state.visited, book.pages.length) ?? current); $('reader').scrollIntoView({ behavior: 'instant' }); $('reader').focus({ preventScroll: true }); }
function openBook(comic, page, push = true) {
  if (book?.id !== comic.id) images.clear();
  book = comic; state = readSaved(storage, comic); current = validPage(page, comic.pages.length) ? page : state.page;
  layoutOverride = null; textMode = false; openedReviewBook = null;
  $('library').hidden = true; $('reading-view').hidden = false;
  $('skip-link').href = '#reader'; $('skip-link').textContent = 'Skip to the book';
  $('contents-grid').replaceChildren(); comments?.reset();
  if (push) history.pushState(null, '', `#read=${comic.id}&page=${current}`);
  save(); render();
  $('reader').scrollIntoView({ behavior: 'instant' }); $('reader').focus({ preventScroll: true }); revealControls();
  if (!reduced.matches) $('reader').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 400, easing: 'ease-out' });
}
async function showLibrary(push = true) {
  try { await fullscreen.exit(); } catch { /* Keep navigation available. */ }
  ++generation; turning = false; observer.disconnect(); cancelFlip(stage);
  $('reading-view').hidden = true; $('library').hidden = false;
  setAmbience.setActive?.(false);
  $('skip-link').href = '#library-title'; $('skip-link').textContent = 'Skip to the library';
  if (push) history.pushState(null, '', libraryHash());
  document.title = 'Comic library — AJ / Comics'; renderLibrary();
  $('library-title').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' });
}
function libraryHash() { return `#library${search ? `?q=${encodeURIComponent(search)}` : ''}`; }
function renderLibrary() {
  $('library-search').value = search; $('clear-search').hidden = !search;
  const query = search.trim().toLocaleLowerCase('en');
  const filtered = comics.filter((comic) => [comic.title, comic.author, comic.genre, comic.issue].join(' ').toLocaleLowerCase('en').includes(query));
  $('library-status').textContent = `${filtered.length} ${filtered.length === 1 ? 'book' : 'books'}${query ? ' found' : ' on the shelf'}`;
  const cards = filtered.map((comic, index) => {
    const saved = readSaved(storage, comic), card = el('article', 'cover-card');
    const cover = el('button', 'cover-art'); cover.type = 'button'; cover.setAttribute('aria-label', `Read ${comic.title}`);
    const image = new Image(); image.alt = `${comic.title} cover`; image.width = comic.width; image.height = comic.height;
    image.loading = index ? 'lazy' : 'eager'; image.decoding = 'async';
    if (comic.pages[0].small) image.srcset = `${comic.pages[0].small} 800w, ${comic.cover} 1600w`;
    image.sizes = '(max-width:680px) 75vw, 350px'; image.src = comic.cover;
    image.addEventListener('error', () => { if (image.srcset) { image.removeAttribute('srcset'); image.src = comic.cover; } });
    cover.append(image); cover.addEventListener('click', () => openBook(comic));
    const copy = el('div', 'cover-copy');
    copy.append(el('p', 'eyebrow', comic.genre || 'GRAPHIC NOVEL'), el('h2', '', comic.title), el('p', 'cover-meta', `${comic.issue || ''} · ${comic.pages.length} pages · ${comic.author || 'Independent comic'}`), el('p', 'cover-description', comic.description || ''));
    const actions = el('div', 'cover-actions'), hasProgress = saved.visited.length > 0 || saved.page > 0;
    const read = el('button', 'button primary', hasProgress ? 'Continue reading →' : 'Open the book →'); read.type = 'button'; read.addEventListener('click', () => openBook(comic)); actions.append(read);
    if (hasProgress) { const start = el('button', 'text-button', 'Read from cover'); start.type = 'button'; start.addEventListener('click', () => openBook(comic, 0)); actions.append(start); }
    if (!downloads.has(comic.id)) downloads.set(comic.id, { busy: false, message: '', status: null, button: null });
    const job = downloads.get(comic.id);
    const status = el('p', 'offline-status', job.message); status.setAttribute('role', 'status'); job.status = status;
    const download = el('button', 'text-button', 'Download for offline'); download.type = 'button';
    download.disabled = job.busy; job.button = download;
    download.addEventListener('click', async () => {
      if (job.busy) return;
      job.busy = true; job.button.disabled = true;
      try { await offline.download(comic, (message) => { job.message = message; job.status.textContent = message; }); }
      finally { job.busy = false; job.button.disabled = false; }
    });
    if (offline.available) actions.append(download);
    copy.append(actions);
    const progress = el('div', 'cover-progress', `${saved.visited.length} / ${comic.pages.length} pages opened${saved.page ? ` · Saved at page ${comic.pages[saved.page].label}` : ''}`);
    const bar = el('progress'); bar.value = saved.visited.length; bar.max = comic.pages.length; bar.setAttribute('aria-label', `${comic.title}: ${saved.visited.length} of ${comic.pages.length} pages opened`); progress.append(bar);
    copy.append(progress, status); card.append(cover, copy); return card;
  });
  if (!cards.length) { const empty = el('div', 'empty-state'); empty.append(el('h2', '', 'No books match that search.'), el('p', '', 'Try the title, author, or genre.')); const clear = el('button', 'button', 'Clear search'); clear.type = 'button'; clear.addEventListener('click', clearSearch); empty.append(clear); cards.push(empty); }
  $('library-shelf').replaceChildren(...cards);
}
function clearSearch() { search = ''; history.replaceState(null, '', libraryHash()); renderLibrary(); $('library-search').focus(); }
$('library-search').addEventListener('compositionstart', () => { composing = true; });
$('library-search').addEventListener('compositionend', () => { composing = false; applySearch(); });
function applySearch() { if (composing) return; search = $('library-search').value; history.replaceState(null, '', libraryHash()); renderLibrary(); }
$('library-search').addEventListener('input', applySearch); $('clear-search').addEventListener('click', clearSearch);

function buildContents() {
  $('contents-grid').replaceChildren(...book.pages.map((page) => {
    const button = el('button', 'contents-item'); button.type = 'button'; button.dataset.page = String(page.id);
    const image = new Image(); image.src = page.thumbnail; image.alt = ''; image.width = 180; image.height = Math.round(180 * book.height / book.width); image.loading = 'lazy'; image.decoding = 'async';
    button.append(image, el('span')); button.addEventListener('click', () => { $('contents-dialog').close(); go(page.id); }); return button;
  })); updateProgress();
}
$('contents-button').addEventListener('click', () => { buildContents(); openDialog($('contents-dialog'), $('contents-button')); });
$('help-button').addEventListener('click', () => openDialog($('help-dialog'), $('help-button')));
$('previous').addEventListener('click', () => turn(-1)); $('next').addEventListener('click', () => turn(1));
$('edge-left').addEventListener('click', () => turn(book.readingDirection === 'rtl' ? 1 : -1));
$('edge-right').addEventListener('click', () => turn(book.readingDirection === 'rtl' ? -1 : 1));
$('next-unread').addEventListener('click', firstUnread); $('finish-reading').addEventListener('click', firstUnread);
$('library-button').addEventListener('click', () => showLibrary());
$('layout-button').addEventListener('click', () => { layoutOverride = !single(); render(); revealControls(); });
$('text-button').addEventListener('click', () => { textMode = !textMode; render(); revealControls(); });
$('page-scrubber').addEventListener('input', () => { const page = book.pages[Number($('page-scrubber').value)]; $('page-label').textContent = page.id ? `Page ${page.label}` : 'Cover'; $('page-scrubber').setAttribute('aria-valuetext', $('page-label').textContent); });
$('page-scrubber').addEventListener('change', () => go(Number($('page-scrubber').value)));
$('discussion-button').addEventListener('click', () => { $('discussion').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' }); });

attachSwipe($('book-host'), {
  onTurn: (direction) => turn(book.readingDirection === 'rtl' ? -direction : direction),
  isBlocked: () => !inReader() || textMode || turning,
  reducedMotion: () => reduced.matches,
});
document.addEventListener('keydown', (event) => {
  if (!inReader() || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) return;
  if (event.target.closest('input,textarea,select,[contenteditable=true],.transcript')) return;
  if (event.target !== document.body && !event.target.closest('#reader')) return;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'f', 'F', 'c', 'C'].includes(event.key)) event.preventDefault(); else return;
  if (event.key === 'Home') go(0); else if (event.key === 'End') go(book.pages.length - 1);
  else if (event.key.toLowerCase() === 'f') fullscreen.toggle();
  else if (event.key.toLowerCase() === 'c') $('contents-button').click();
  else turn((event.key === 'ArrowRight' ? 1 : -1) * (book.readingDirection === 'rtl' ? -1 : 1));
});
narrow.addEventListener('change', () => { layoutOverride = null; if (inReader()) render(); });
new ResizeObserver(() => {
  const host = $('book-host'), size = `${Math.round(host.clientWidth)}:${Math.round(host.clientHeight)}:${window.devicePixelRatio}`;
  if (inReader() && size !== lastSize) { lastSize = size; render(); }
}).observe($('book-host'));
document.addEventListener('visibilitychange', checkOpened); document.addEventListener('reader-overlay', checkOpened);
window.addEventListener('storage', (event) => {
  if (book && event.key === storageKey(book)) {
    try { state.visited = visitedFor(book.pages.length, state.visited, normalizeState(JSON.parse(event.newValue), book.pages.length).visited); updateProgress(); } catch { /* Ignore corrupted foreign state. */ }
  }
  if (!$('library').hidden) renderLibrary();
});
const glow = preferences.glow !== false;
document.body.classList.toggle('no-glow', !glow); $('glow-button').setAttribute('aria-pressed', String(glow)); $('glow-button').textContent = glow ? 'Ambient light on' : 'Ambient light off';
$('glow-button').addEventListener('click', () => {
  preferences.glow = $('glow-button').getAttribute('aria-pressed') !== 'true';
  document.body.classList.toggle('no-glow', !preferences.glow); $('glow-button').setAttribute('aria-pressed', String(preferences.glow));
  $('glow-button').textContent = preferences.glow ? 'Ambient light on' : 'Ambient light off'; savePreferences(storage, preferences);
});
function route() {
  const params = new URLSearchParams(location.hash.slice(1)), id = params.get('read');
  if (id) { const comic = comics.find((c) => c.id === id); if (comic) { const value = params.get('page'); openBook(comic, /^\d+$/.test(value || '') ? Number(value) : undefined, false); } else { showLibrary(false); $('library-status').textContent = 'That book is not in this library. Choose a book below.'; } }
  else if (location.hash.startsWith('#page=')) openBook(comics[0], pageFromHash(location.hash, comics[0].pages.length) ?? 0, false);
  else { search = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || ''; showLibrary(false); }
}
window.addEventListener('hashchange', () => { if (comics.length) route(); });
async function boot() {
  $('library-status').textContent = 'Opening the library…';
  try {
    comics = validateCatalog(await fetchJson('comics.json'));
    comments = initComments(() => Boolean(book && isComplete(state.visited, book.pages.length)), () => book);
    route();
  } catch {
    $('library-status').textContent = 'The library couldn’t open. Check your connection and retry. Your saved place is safe.';
    const retry = el('button', 'button', 'Retry library'); retry.type = 'button'; retry.addEventListener('click', boot); $('library-shelf').replaceChildren(retry);
  }
}
boot();
