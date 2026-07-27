/**
 * Nullsec — Navigation Manager
 * Handles mobile hamburger menu, active link highlighting,
 * and sticky navbar behaviour.
 */

(function () {
  'use strict';

  /** Highlight the current page link in the nav. */
  function highlightActiveLink() {
    const path = window.location.pathname.replace(/\/$/, '') || '/index.html';
    const links = document.querySelectorAll('.navbar-links a, .mobile-menu a');
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      // Normalise both paths for comparison
      const linkPath = href.replace(/\/$/, '');
      if (path === linkPath || path.endsWith(linkPath)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /** Toggle mobile menu. */
  function toggleMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    if (!hamburger || !mobileMenu) return;

    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      // Prevent body scroll when menu is open
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close menu on link click
    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    // Close on resize to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  /** Initialise navigation. */
  function init() {
    highlightActiveLink();
    toggleMobileMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
