// The final supplied theme removes the intro. Swipe, fullscreen and status keep
// their tested owners in app.js rather than gaining duplicate event handlers.
const header = document.querySelector('.library-header');
if (header) addEventListener('scroll', () => header.classList.toggle('is-compact', scrollY > 40), { passive: true });
