/**
 * NullSec — Navigation Manager
 * Handles mobile hamburger menu, active link highlighting,
 * and sticky navbar behaviour.
 */

(function () {
  'use strict';

  /** Highlight the current page link in the nav. */
  function highlightActiveLink() {
    // M60: canonicalise the current path so the homepage (/ or /index.html)
    // and a trailing-slash page map to the same value.
    let path = window.location.pathname.replace(/\/$/, '');
    if (path === '' || path === '/index.html') path = '/';
    // M61: exclude the Sign out action (which shares the Account href) so it is
    // never marked as the active destination page.
    const links = document.querySelectorAll('.navbar-links a:not(.nav-signout), .mobile-menu a:not(.nav-signout)');
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      // Normalise both paths for comparison
      let linkPath = href.replace(/\/$/, '');
      // Home link ('./', '/', './index.html') → canonical '/'
      if (linkPath === '' || linkPath === '.' || linkPath === './' ||
          linkPath === '/' || linkPath === './index.html' || linkPath === 'index.html') {
        linkPath = '/';
      }
      if (path === linkPath || path.endsWith(linkPath)) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
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
      // Accessibility: reflect menu open state on the toggle button.
      hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // Prevent body scroll when menu is open
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close menu on link click
    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });

    // Close on resize to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
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
    if (!window.Auth) return;
    const authed = Auth.isAuthenticated();
    const signOut = function () {
      Auth.logout();
      // M49: after logout, immediately clear any injected sign-out controls and
      // go to the account page (which will show the guest gateway).
      reconcileSessionNav();
      window.location.href = 'profile.html';
    };
    // M61: build the "Sign out" control. It is an account ACTION, so it is kept
    // visually separate from the primary site-destination links (see the
    // .navbar-actions .nav-signout styling) instead of reading as another
    // content page in the main navigation bar.
    function makeSignOut() {
      const link = document.createElement('a');
      link.className = 'nav-signout';
      link.setAttribute('href', 'profile.html');
      link.textContent = 'Sign out';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        signOut();
      });
      return link;
    }
    function reconcileSessionNav() {
      // Always remove existing sign-out controls so a logout/expiry never leaves
      // a stale "Sign out" on the page.
      document.querySelectorAll('.nav-signout').forEach(function (el) { el.remove(); });
      if (!authed) return;
      // Desktop: Sign out lives in the actions area (search / theme / discord),
      // not among the primary destination links.
      const actions = document.querySelector('.navbar-actions');
      if (actions) {
        const link = makeSignOut();
        const hamburger = actions.querySelector('.hamburger');
        if (hamburger) actions.insertBefore(link, hamburger);
        else actions.appendChild(link);
      }
      // Mobile: Sign out lives in the mobile menu, after the Account link.
      const menu = document.querySelector('.mobile-menu');
      if (menu) {
        const accountLink = menu.querySelector('a[href="profile.html"]');
        const link = makeSignOut();
        if (accountLink) accountLink.parentNode.insertBefore(link, accountLink.nextSibling);
        else menu.appendChild(link);
      }
    }
    reconcileSessionNav();
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
