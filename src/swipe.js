// Adapted from the supplied swipe.js. One physical gesture calls the existing
// navigation owner directly; it never dispatches a synthetic keyboard event.
export function swipeDirection({ dx, dy, elapsed, width }, { minDistance = 60, minVelocity = .5 } = {}) {
  if (Math.abs(dx) <= Math.abs(dy) * 1.2) return 0;
  const distance = Math.abs(dx);
  const far = distance > Math.max(minDistance, width * .12);
  const flick = distance > 30 && distance / Math.max(1, elapsed) > minVelocity;
  return far || flick ? (dx < 0 ? 1 : -1) : 0;
}

export function attachSwipe(stage, { onTurn, isBlocked = () => false, reducedMotion = () => false } = {}) {
  let gesture = null, swallowClickUntil = 0;
  // Native image dragging cancels pointer events before the turn can finish.
  stage.addEventListener('dragstart', (event) => event.preventDefault());
  const reset = () => {
    const previous = gesture;
    gesture = null;
    stage.classList.remove('cx-dragging');
    stage.style.setProperty('--cx-drag', '0px');
    if (previous && stage.hasPointerCapture?.(previous.id)) stage.releasePointerCapture(previous.id);
  };
  stage.addEventListener('pointerdown', (event) => {
    // A second finger cancels turning so pinching cannot turn a page.
    if (!event.isPrimary) { reset(); return; }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isBlocked() || document.querySelector('dialog[open]')) return;
    const control = event.target.closest('button,a,input,select,textarea,[role="slider"]');
    // Artwork is a zoom button; a tap enlarges it, a drag turns the page.
    if (control && !control.classList.contains('page-art')) return;
    swallowClickUntil = 0;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), dx: 0, dy: 0, axis: null };
  });
  stage.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (isBlocked() || document.querySelector('dialog[open]')) { reset(); return; }
    gesture.dx = event.clientX - gesture.x;
    gesture.dy = event.clientY - gesture.y;
    if (!gesture.axis && Math.hypot(gesture.dx, gesture.dy) > 10) {
      gesture.axis = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2 ? 'x' : 'y';
      if (gesture.axis === 'x') {
        try { stage.setPointerCapture(gesture.id); } catch { /* Pointer may already have been cancelled. */ }
      }
    }
    if (gesture.axis !== 'x') return;
    stage.classList.add('cx-dragging');
    if (!reducedMotion()) stage.style.setProperty('--cx-drag', `${Math.max(-180, Math.min(180, gesture.dx))}px`);
  });
  stage.addEventListener('pointerup', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const previous = gesture;
    previous.dx = event.clientX - previous.x;
    previous.dy = event.clientY - previous.y;
    if (previous.axis === 'x') swallowClickUntil = performance.now() + 450;
    reset();
    if (previous.axis !== 'x' || isBlocked() || document.querySelector('dialog[open]')) return;
    const direction = swipeDirection({ ...previous, elapsed: performance.now() - previous.time, width: stage.clientWidth });
    if (!direction) return;
    onTurn?.(direction);
    if (!reducedMotion() && typeof navigator.vibrate === 'function') navigator.vibrate(8);
  });
  stage.addEventListener('pointercancel', reset);
  stage.addEventListener('lostpointercapture', reset);
  stage.addEventListener('click', (event) => {
    if (performance.now() >= swallowClickUntil) return;
    swallowClickUntil = 0;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
}
