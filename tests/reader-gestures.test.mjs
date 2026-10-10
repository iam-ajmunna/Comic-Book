import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { swipeDirection } from '../src/swipe.js';
import { initFullscreen } from '../src/fullscreen.js';

function target() {
  const handlers = new Map(), classes = new Set(), attributes = new Map();
  return {
    classList: {
      contains: (name) => classes.has(name), add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    },
    addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(handler); },
    emit(type, event = {}) { event.type = type; for (const handler of handlers.get(type) || []) handler(event); },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    focus() { this.focused = true; },
  };
}

test('swipe thresholds distinguish slow drags, quick flicks and vertical scrolling', () => {
  assert.equal(swipeDirection({ dx: -130, dy: 8, elapsed: 900, width: 800 }), 1);
  assert.equal(swipeDirection({ dx: 45, dy: 4, elapsed: 60, width: 800 }), -1);
  assert.equal(swipeDirection({ dx: 45, dy: 4, elapsed: 600, width: 800 }), 0);
  assert.equal(swipeDirection({ dx: -150, dy: 180, elapsed: 100, width: 800 }), 0);
});

function gestures({ reduced = false } = {}) {
  const stage = target(), turns = [], properties = new Map();
  let clock = 0, captured = null, blocked = false;
  stage.clientWidth = 800;
  stage.style = { setProperty: (name, value) => properties.set(name, value) };
  stage.setPointerCapture = (id) => { captured = id; };
  stage.hasPointerCapture = (id) => captured === id;
  stage.releasePointerCapture = () => { captured = null; };
  const source = readFileSync(new URL('../src/swipe.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  const attach = runInNewContext(`${source}\nattachSwipe`, {
    document: { querySelector: () => null }, performance: { now: () => clock }, navigator: {},
  });
  attach(stage, { onTurn: (direction) => turns.push(direction), isBlocked: () => blocked, reducedMotion: () => reduced });
  const artwork = { closest: () => ({ classList: { contains: (name) => name === 'page-art' } }) };
  const emit = (type, x, y = 0, extra = {}) => {
    clock += 40;
    stage.emit(type, { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: x, clientY: y, target: artwork, ...extra });
  };
  return { stage, emit, turns, properties, block: () => { blocked = true; } };
}

test('dragging artwork turns once and suppresses the follow-up zoom click', () => {
  const reader = gestures();
  let nativeDragBlocked = false;
  reader.stage.emit('dragstart', { preventDefault: () => { nativeDragBlocked = true; } });
  assert.equal(nativeDragBlocked, true);
  reader.emit('pointerdown', 200); reader.emit('pointermove', 60); reader.emit('pointerup', 60);
  assert.deepEqual(reader.turns, [1]);
  let cancelled = false, stopped = false;
  reader.stage.emit('click', { preventDefault: () => { cancelled = true; }, stopImmediatePropagation: () => { stopped = true; } });
  assert.equal(cancelled && stopped, true);
  assert.equal(reader.properties.get('--cx-drag'), '0px');
});

test('a tap keeps zoom available; cancellation, extra fingers and blocked readers never turn', () => {
  const tap = gestures(); tap.emit('pointerdown', 100); tap.emit('pointerup', 101);
  tap.stage.emit('click', { preventDefault: () => assert.fail('A tap must reach the zoom button') });
  for (const reason of ['cancel', 'pinch', 'blocked']) {
    const reader = gestures(); reader.emit('pointerdown', 200); reader.emit('pointermove', 40);
    if (reason === 'cancel') reader.emit('pointercancel', 40);
    if (reason === 'pinch') reader.emit('pointerdown', 40, 0, { isPrimary: false, pointerId: 2 });
    if (reason === 'blocked') reader.block();
    reader.emit('pointerup', 40); assert.deepEqual(reader.turns, []);
  }
});

test('reduced motion keeps swipe navigation while disabling drag-follow', () => {
  const reader = gestures({ reduced: true });
  reader.emit('pointerdown', 200); reader.emit('pointermove', 40);
  assert.equal(reader.properties.has('--cx-drag'), false);
  reader.emit('pointerup', 40); assert.deepEqual(reader.turns, [1]);
});

function fullscreen() {
  const doc = target(), view = target(), button = target(), icon = target(), messages = [];
  doc.body = target(); doc.querySelector = () => null;
  const controller = initFullscreen(view, button, icon, { document: doc, announce: (message) => messages.push(message), reveal: () => {} });
  return { doc, view, button, icon, messages, controller };
}

test('missing Fullscreen API gets an escapable expanded layout and correct icon', async () => {
  const reader = fullscreen();
  await reader.controller.toggle();
  assert.equal(reader.view.classList.contains('cx-pseudo-fs'), true);
  assert.equal(reader.button.getAttribute('aria-pressed'), 'true');
  assert.equal(reader.icon.getAttribute('href'), '#icon-collapse');
  assert.match(reader.messages[0], /Expanded reading view/);
  reader.doc.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(reader.doc.body.classList.contains('cx-pseudo-fs'), false);
  assert.equal(reader.button.getAttribute('aria-pressed'), 'false');
  assert.equal(reader.button.focused, true);
  await reader.controller.toggle(); await reader.controller.exit();
  assert.equal(reader.view.classList.contains('cx-pseudo-fs'), false);
});

test('denied fullscreen requests retain inactive state and explain failure', async () => {
  const reader = fullscreen();
  reader.view.requestFullscreen = async () => { throw new Error('Denied'); };
  await reader.controller.toggle();
  assert.equal(reader.button.getAttribute('aria-pressed'), 'false');
  assert.equal(reader.icon.getAttribute('href'), '#icon-expand');
  assert.equal(reader.view.classList.contains('cx-pseudo-fs'), false);
  assert.match(reader.messages[0], /couldn’t start/);
});

test('native fullscreen follows actual events and coalesces rapid requests', async () => {
  const reader = fullscreen(); let calls = 0, resolve;
  reader.view.requestFullscreen = () => { calls++; return new Promise((done) => { resolve = done; }); };
  const pending = reader.controller.toggle(); await reader.controller.toggle();
  assert.equal(calls, 1); assert.equal(reader.button.getAttribute('aria-pressed'), 'false');
  reader.doc.fullscreenElement = reader.view; reader.doc.emit('fullscreenchange'); resolve(); await pending;
  assert.equal(reader.button.getAttribute('aria-pressed'), 'true');
  reader.doc.exitFullscreen = async () => { reader.doc.fullscreenElement = null; reader.doc.emit('fullscreenchange'); };
  await reader.controller.exit(); assert.equal(reader.button.getAttribute('aria-pressed'), 'false');
});
