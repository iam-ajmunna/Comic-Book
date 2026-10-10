import { config } from './config.js?v=20261010-7';

export class FeedbackError extends Error {
  constructor(message, field = '') { super(message); this.field = field; }
}

export function validateDraft(name, text) {
  const value = { name: name.trim(), text: text.trim() };
  if (!value.name || value.name.length > config.nameLimit || /[\u0000-\u001f\u007f]/.test(value.name))
    throw new FeedbackError('Enter your name (up to 80 characters).', 'name');
  if (value.text.length < 3 || value.text.length > config.commentLimit || /[\u0000\u000b\u000c]/.test(value.text))
    throw new FeedbackError('Write between 3 and 600 characters.', 'text');
  return value;
}

export function validPhotoData(photo) {
  return typeof photo === 'string' && photo.length <= 90_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo);
}

// No cookies, access tokens, account creation or GitHub handoff. The service
// validates again and confirms durable storage before the UI says "posted".
export function createFeedbackClient(endpoint = config.feedbackEndpoint) {
  async function request(url, options = {}) {
    let result;
    try { result = await fetch(url, { credentials: 'omit', cache: 'no-store', ...options }); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new FeedbackError('Couldn’t reach feedback. Check your connection and try again. Your draft is still here.');
    }
    let data;
    try { data = await result.json(); } catch { throw new FeedbackError('Feedback is temporarily unavailable. Your draft is still here; try again.'); }
    if (!result.ok) throw new FeedbackError(data.error || 'Feedback is temporarily unavailable. Try again.', data.field || '');
    return data;
  }
  return {
    async list(book, cursor, signal) {
      const url = new URL(endpoint);
      url.searchParams.set('book', book.id); url.searchParams.set('edition', book.edition);
      if (cursor) url.searchParams.set('cursor', cursor);
      const data = await request(url.href, { signal });
      if (!Array.isArray(data.reviews)) throw new FeedbackError('Feedback couldn’t load. Refresh to try again.');
      return data;
    },
    async post(book, draft, signal) {
      const data = await request(endpoint, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, book: book.id, edition: book.edition }),
      });
      if (!data.review?.id || data.review.id !== draft.id)
        throw new FeedbackError('Couldn’t confirm your feedback. Try again with this draft.');
      return data.review;
    },
  };
}
