/**
 * NullSec — TL;DR Toggle
 * Handles click-to-expand quick summaries on article pages.
 * Premium style: minimalist accent bar, pill button, smooth animation.
 */

(function () {
  'use strict';

  function initTldr() {
    let tldrs = document.querySelectorAll('.tldr');
    if (!tldrs.length) return;

    tldrs.forEach(function (box) {
      let header = box.querySelector('.tldr-header');
      let btn = box.querySelector('.tldr-toggle-btn');
      let content = box.querySelector('.tldr-content');
      if (!header || !btn) return;

      // M58: announce the expand/collapse state to assistive technology. The
      // toggle button controls the summary content, so it carries
      // aria-expanded + aria-controls; the content is hidden from AT while
      // collapsed (the CSS max-height:0 hides it visually).
      if (!btn.getAttribute('aria-controls')) {
        const contentId = 'tldr-content-' + (btn.getAttribute('data-tldr-id') || String(Math.random().toString(36).slice(2, 8)));
        btn.setAttribute('data-tldr-id', contentId);
        if (content) content.id = contentId;
      }
      const contentId = btn.getAttribute('data-tldr-id');
      btn.setAttribute('aria-expanded', box.classList.contains('open') ? 'true' : 'false');
      if (contentId) btn.setAttribute('aria-controls', contentId);
      if (content) content.setAttribute('aria-hidden', box.classList.contains('open') ? 'false' : 'true');

      function syncAria() {
        const open = box.classList.contains('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (content) content.setAttribute('aria-hidden', open ? 'false' : 'true');
      }

      function toggle() {
        // Don't toggle if user selected text
        if (window.getSelection && window.getSelection().toString().length > 0) return;
        box.classList.toggle('open');
        btn.textContent = box.classList.contains('open') ? 'Close' : 'Read summary';
        // Re-add the arrow
        let arrow = document.createElement('span');
        arrow.className = 'tldr-arrow';
        arrow.innerHTML = '&#9660;';
        btn.appendChild(arrow);
        syncAria();
      }

      header.addEventListener('click', toggle);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTldr);
  } else {
    initTldr();
  }
})();
