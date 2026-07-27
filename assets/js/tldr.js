/**
 * NullSec — TL;DR Toggle
 * Handles click-to-expand quick summaries on article pages.
 */

(function () {
  'use strict';

  function initTldr() {
    const tldrs = document.querySelectorAll('.tldr');
    if (!tldrs.length) return;

    tldrs.forEach(function (box) {
      const header = box.querySelector('.tldr-header');
      if (!header) return;

      header.addEventListener('click', function (e) {
        // Don't toggle if user selected text
        if (window.getSelection && window.getSelection().toString().length > 0) return;
        box.classList.toggle('open');
      });

      // Auto-open if user prefers reduced motion — they won't see the animation anyway
      // but let's keep it closed by default for a clean reading experience.
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTldr);
  } else {
    initTldr();
  }
})();
