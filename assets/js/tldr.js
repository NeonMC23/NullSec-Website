/**
 * NullSec — TL;DR Toggle
 * Handles click-to-expand quick summaries on article pages.
 * Premium style: minimalist accent bar, pill button, smooth animation.
 */

(function () {
  'use strict';

  function initTldr() {
    var tldrs = document.querySelectorAll('.tldr');
    if (!tldrs.length) return;

    tldrs.forEach(function (box) {
      var header = box.querySelector('.tldr-header');
      var btn = box.querySelector('.tldr-toggle-btn');
      if (!header || !btn) return;

      function toggle() {
        // Don't toggle if user selected text
        if (window.getSelection && window.getSelection().toString().length > 0) return;
        box.classList.toggle('open');
        btn.textContent = box.classList.contains('open') ? 'Close' : 'Read summary';
        // Re-add the arrow
        var arrow = document.createElement('span');
        arrow.className = 'tldr-arrow';
        arrow.innerHTML = '&#9660;';
        btn.appendChild(arrow);
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
