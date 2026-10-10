import { config } from './config.js?v=20261010-7';
import { createFeedbackClient, validateDraft, validPhotoData } from './feedback-api.js?v=20261010-7';
import { preparePhoto } from './feedback-photo.js?v=20261010-7';

// One owner for the inline composer, per-book drafts and the shared feed.
// Nothing is "posted" until the server confirms the same submission ID.
export function initComments(canComment, getBook, { client = createFeedbackClient(), preparePicture = preparePhoto } = {}) {
  const $ = id => document.getElementById(id);
  const name = $('reader-name'), field = $('comment'), file = $('reader-photo');
  const form = $('comment-form'), track = $('comment-list');
  const fieldIds = { name: 'reader-name', text: 'comment', photo: 'reader-photo' };
  const errorIds = { name: 'name-error', text: 'comment-error', photo: 'photo-error' };
  let busy = false, cursor = null, hasMore = false, viewGeneration = 0, loadGeneration = 0;
  let feedAborter, submitAborter, submitting = false, pictureGeneration = 0, photoPending = false;
  let photo = null, photoLabel = '', pictureError = '', submissionId = null, rendered = new Set();
  let composing = false;
  const drafts = new Map();
  let draftBook = null;

  function error(key, message = '') {
    const node = $(errorIds[key]); node.textContent = message; node.hidden = !message;
    $(fieldIds[key]).setAttribute('aria-invalid', String(Boolean(message)));
  }
  function clearErrors() { for (const key of Object.keys(fieldIds)) error(key); }
  function count() {
    $('comment-count').textContent = `${field.value.length}/${config.commentLimit}`;
    field.style.height = 'auto';
    field.style.height = `${Math.min(360, Math.max(130, field.scrollHeight || 130))}px`;
  }
  function syncSubmit() {
    $('post-feedback').disabled = submitting || photoPending;
    $('post-feedback').textContent = submitting ? 'Posting…' : 'Post feedback';
    $('comment-fields').disabled = submitting;
    $('cancel-feedback').hidden = !submitting;
    form.setAttribute('aria-busy', String(submitting || photoPending));
  }
  function preview() {
    $('photo-selection').hidden = !(photo || pictureError || photoPending);
    $('photo-preview').hidden = !photo;
    // Removing an image source avoids an unnecessary request for the document.
    if (photo) $('photo-preview').src = photo;
    else $('photo-preview').removeAttribute('src');
    $('photo-name').textContent = photoLabel;
  }
  function edited() { submissionId = null; $('comment-status').textContent = ''; }
  for (const input of [name, field]) {
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
  }
  name.addEventListener('input', () => { edited(); if (name.value.trim()) error('name'); });
  field.addEventListener('input', () => { edited(); count(); if (field.value.trim().length >= 3) error('text'); });
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    const request = ++pictureGeneration;
    photoPending = true; pictureError = ''; error('photo'); edited(); syncSubmit();
    preview();
    $('comment-status').textContent = 'Preparing your picture…';
    try {
      const result = await preparePicture(selected);
      if (request !== pictureGeneration) return;
      if (!validPhotoData(result)) throw new Error('This picture couldn’t be prepared. Choose another.');
      photo = result; photoLabel = `${selected.name} · ${(selected.size / 1024).toFixed(0)} KB`;
      preview(); $('comment-status').textContent = 'Picture ready. It will be shared when you post feedback.';
    } catch (e) {
      if (request !== pictureGeneration) return;
      pictureError = e.message; error('photo', pictureError);
      if (!photo) photoLabel = selected.name;
      preview();
      $('comment-status').textContent = '';
    } finally {
      if (request === pictureGeneration) { photoPending = false; file.value = ''; preview(); syncSubmit(); }
    }
  });
  $('remove-photo').addEventListener('click', () => {
    pictureGeneration++; photoPending = false; pictureError = ''; photo = null; photoLabel = '';
    file.value = ''; error('photo'); edited(); preview(); syncSubmit(); file.focus();
  });
  $('cancel-feedback').addEventListener('click', () => submitAborter?.abort());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!canComment() || submitting || photoPending || composing || !getBook()) return;
    clearErrors();
    let values;
    try {
      values = validateDraft(name.value, field.value);
      if (pictureError) { error('photo', pictureError); file.focus(); return; }
    } catch (e) { error(e.field || 'text', e.message); $(fieldIds[e.field || 'text']).focus(); return; }
    if (!submissionId)
      submissionId = `${Date.now()}-${crypto.randomUUID()}`;
    const draft = { ...values, id: submissionId, photo };
    const book = getBook(), ownView = viewGeneration;
    submitting = true; submitAborter = new AbortController();
    const ownAborter = submitAborter;
    syncSubmit(); $('comment-status').textContent = 'Posting your feedback…';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ownAborter.abort(); }, 20_000);
    try {
      const review = await client.post(book, draft, ownAborter.signal);
      if (ownView !== viewGeneration) return;
      field.value = ''; submissionId = null; count();
      submitting = false; syncSubmit();
      $('comment-status').textContent = 'Your feedback is posted. Thank you for reading.';
      await load(true);
      if (ownView === viewGeneration && !rendered.has(review.id)) appendComment(review);
    } catch (e) {
      if (ownView !== viewGeneration) return;
      submitting = false; syncSubmit();
      if (e.field && fieldIds[e.field]) { error(e.field, e.message); $(fieldIds[e.field]).focus(); }
      $('comment-status').textContent = e.name === 'AbortError'
        ? `${timedOut ? 'Couldn’t confirm the post in time.' : 'Stopped waiting for the post.'} Your draft is kept. Retry this unchanged draft safely; it won’t post twice.`
        : e.message;
    } finally {
      clearTimeout(timer);
      if (ownView === viewGeneration && ownAborter === submitAborter) { submitting = false; syncSubmit(); }
    }
  });

  function syncCarousel() {
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    $('feedback-previous').disabled = !track.children.length || track.scrollLeft <= 1;
    $('feedback-next').disabled = !track.children.length || track.scrollLeft >= max - 1;
  }
  function moveCarousel(direction) {
    const width = track.firstElementChild?.getBoundingClientRect().width || 300;
    track.scrollBy({ left: direction * (width + 16), behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
  }
  track.addEventListener('scroll', syncCarousel, { passive: true });
  new ResizeObserver(syncCarousel).observe(track);
  $('feedback-previous').addEventListener('click', () => moveCarousel(-1));
  $('feedback-next').addEventListener('click', () => moveCarousel(1));

  function appendComment(review) {
    if (!review?.id || rendered.has(review.id)) return;
    rendered.add(review.id);
    const card = document.createElement('article'); card.className = 'comment-card';
    const header = document.createElement('header'), author = document.createElement('strong'), date = document.createElement('time');
    author.textContent = review.name;
    const d = new Date(review.created_at);
    if (!Number.isNaN(d.valueOf())) { date.dateTime = d.toISOString(); date.textContent = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(d); }
    const byline = document.createElement('div'); byline.className = 'comment-byline'; byline.append(author, date);
    const initials = document.createElement('span'); initials.className = 'comment-avatar'; initials.setAttribute('aria-hidden', 'true');
    initials.textContent = Array.from(review.name || '?')[0].toUpperCase();
    if (validPhotoData(review.photo)) {
      const image = new Image(); image.className = 'comment-avatar'; image.alt = ''; image.width = image.height = 48;
      image.loading = 'lazy'; image.decoding = 'async'; image.addEventListener('error', () => image.replaceWith(initials), { once: true });
      image.src = review.photo; header.append(image);
    } else header.append(initials);
    header.append(byline);
    const text = document.createElement('p'); text.textContent = review.text;
    card.append(header, text); track.append(card); syncCarousel();
  }
  async function load(reset = false) {
    if (!canComment() || !getBook() || (busy && !reset)) return;
    feedAborter?.abort(); feedAborter = new AbortController();
    const ownAborter = feedAborter, request = ++loadGeneration, ownView = viewGeneration;
    busy = true; $('refresh-comments').disabled = true; $('more-comments').disabled = true;
    $('comments-status').textContent = 'Loading reader feedback…'; track.setAttribute('aria-busy', 'true');
    const timer = setTimeout(() => ownAborter.abort(), 15_000);
    try {
      const data = await client.list(getBook(), reset ? null : cursor, ownAborter.signal);
      if (request !== loadGeneration || ownView !== viewGeneration) return;
      if (reset) { track.replaceChildren(); track.scrollLeft = 0; rendered = new Set(); }
      data.reviews.forEach(appendComment);
      cursor = data.cursor || null; hasMore = Boolean(cursor); $('more-comments').hidden = !hasMore;
      $('comments-status').textContent = rendered.size
        ? `${rendered.size} reader ${rendered.size === 1 ? 'comment' : 'comments'} loaded.`
        : 'No feedback yet. Leave the first thought.';
    } catch (e) {
      if (request === loadGeneration && ownView === viewGeneration)
        $('comments-status').textContent = e.name === 'AbortError' ? 'Feedback took too long. Refresh to try again.' : e.message;
    } finally {
      clearTimeout(timer);
      if (request === loadGeneration && ownView === viewGeneration) {
        busy = false; $('refresh-comments').disabled = false; $('more-comments').disabled = false;
        track.setAttribute('aria-busy', 'false'); syncCarousel();
      }
    }
  }
  $('refresh-comments').addEventListener('click', () => load(true));
  $('more-comments').addEventListener('click', () => { if (hasMore) return load(); });
  return {
    refresh: () => load(true),
    reset() {
      if (draftBook) drafts.set(draftBook, { name: name.value, text: field.value, photo, photoLabel, submissionId, pictureError });
      viewGeneration++; loadGeneration++; pictureGeneration++;
      feedAborter?.abort(); submitAborter?.abort(); busy = submitting = photoPending = false;
      cursor = null; hasMore = false; rendered = new Set();
      draftBook = getBook() ? `${getBook().id}:${getBook().edition}` : null;
      const draft = drafts.get(draftBook) || {};
      name.value = draft.name || ''; field.value = draft.text || ''; photo = draft.photo || null; photoLabel = draft.photoLabel || '';
      submissionId = draft.submissionId || null; pictureError = draft.pictureError || ''; file.value = '';
      clearErrors(); if (pictureError) error('photo', pictureError);
      count(); preview(); syncSubmit();
      track.replaceChildren(); track.scrollLeft = 0; track.setAttribute('aria-busy', 'false');
      $('comments-status').textContent = ''; $('comment-status').textContent = '';
      $('refresh-comments').disabled = false; $('more-comments').hidden = true; $('more-comments').disabled = false;
      syncCarousel();
    },
  };
}
