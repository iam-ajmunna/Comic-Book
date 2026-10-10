// Adapted from the supplied comic-enhance.js. Navigation, fullscreen, feedback
// and progress keep their existing owners instead of acquiring duplicate handlers.
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let introduced = false;
try { introduced = sessionStorage.getItem('cx-pow') === '1'; } catch { /* Storage is optional. */ }
if (!introduced && !motion.matches && !location.hash.includes('read=') && !location.hash.startsWith('#page=')) {
  try { sessionStorage.setItem('cx-pow', '1'); } catch { /* One intro during this document is enough. */ }
  // Wait for the local display face instead of showing a visibly different fallback.
  const font = document.fonts?.load('100px Bangers') || Promise.resolve();
  Promise.race([font.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 700))]).then(() => {
    if (motion.matches || document.getElementById('library').hidden) return;
    const pow = document.createElement('div');
    pow.className = 'cx-pow'; pow.setAttribute('aria-hidden', 'true'); pow.textContent = 'POW!';
    document.body.append(pow);
    pow.addEventListener('animationend', () => pow.remove(), { once: true });
    setTimeout(() => pow.remove(), 1100);
  });
}
const header = document.querySelector('.library-header');
if (header) addEventListener('scroll', () => header.classList.toggle('is-compact', scrollY > 40), { passive: true });
