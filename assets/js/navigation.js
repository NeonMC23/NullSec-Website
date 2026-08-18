/**
 * NullSec — Navigation Manager
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

  /**
   * Reflect the session state in the nav (M32): when authenticated, inject a
   * "Sign out" control next to the Account link. Guests keep the static
   * Account link (which hosts the Sign in / Create account forms).
   */
  function initSessionNav() {
    if (!window.Auth || !Auth.isAuthenticated()) return;
    const signOut = function () {
      Auth.logout();
      window.location.href = 'profile.html';
    };
    ['.navbar-links', '.mobile-menu'].forEach(function (sel) {
      const container = document.querySelector(sel);
      if (!container) return;
      const accountLink = container.querySelector('a[href="profile.html"]');
      if (!accountLink || accountLink.nextSibling && accountLink.nextSibling.nodeType === 1 &&
        accountLink.nextSibling.classList.contains('nav-signout')) return;
      const link = document.createElement('a');
      link.className = 'nav-signout';
      link.setAttribute('href', 'profile.html');
      link.textContent = 'Sign out';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        signOut();
      });
      accountLink.parentNode.insertBefore(link, accountLink.nextSibling);
    });
  }

  /**
   * Initialise navigation. The session nav reflects auth state; because the
   * startup session restoration is ASYNC (ns_validate_session), we re-run it
   * once restoration resolves AND on any later auth change (login/logout).
   * This fixes the bug where a logged-in user saw the logged-out nav after
   * navigating to a new page (the sync DOMContentLoaded check ran before the
   * session was restored).
   */
  function init() {
    highlightActiveLink();
    toggleMobileMenu();
    initSessionNav();
    if (window.Auth && Auth.onAuthChange) {
      Auth.onAuthChange(initSessionNav);
    }
    if (window.Session && Session.ensureRestored) {
      Session.ensureRestored().then(function () { initSessionNav(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
