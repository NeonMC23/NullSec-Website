/**
 * NullSec — Animation Manager
 * Handles Intersection Observer fade-in animations,
 * reading progress bar, back-to-top button, and smooth scroll.
 */

(function () {
  'use strict';

  /** Observe .fade-in elements and add .visible when they enter the viewport. */
  function initFadeIn() {
    // Respect reduced motion
    if (Utils.prefersReducedMotion()) {
      document.querySelectorAll('.fade-in').forEach((el) => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.fade-in').forEach((el) => observer.observe(el));
  }

  /** Reading progress bar — tracks scroll depth on article pages. */
  function initProgressBar() {
    const bar = document.getElementById('reading-progress');
    if (!bar) return;

    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const progress = (scrollTop / docHeight) * 100;
      bar.style.width = Math.min(progress, 100) + '%';
    });
  }

  /** Back-to-top button — shows after scrolling down 300px. */
  function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 300);
    });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /** Share button — copies the current URL and shows a brief tooltip. */
  function initShareButton() {
    const btn = document.getElementById('share-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        // Brief visual feedback
        const original = btn.innerHTML;
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => (btn.innerHTML = original), 1500);
      } catch {
        // Fallback
        const url = window.location.href;
        if (navigator.share) {
          navigator.share({ url });
        }
      }
    });
  }

  /** Initialise all animation features. */
  function init() {
    initFadeIn();
    initProgressBar();
    initBackToTop();
    initShareButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
