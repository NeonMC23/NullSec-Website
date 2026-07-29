/**
 * NullSec — Modal System
 * Clean overlay modal for mission details, tool details, etc.
 */

(function () {
  'use strict';

  window.Modal = {
    open: function (html) {
      var existing = document.querySelector('.modal-overlay');
      if (existing) {
        existing.classList.remove('open');
        setTimeout(function() { existing.remove(); }, 200);
      }

      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.innerHTML = '<div class="modal">' +
        '<button class="modal-close" onclick="Modal.close()">&times;</button>' +
        html +
      '</div>';

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) Modal.close();
      });

      document.addEventListener('keydown', function onEscape(e) {
        if (e.key === 'Escape') {
          Modal.close();
          document.removeEventListener('keydown', onEscape);
        }
      });

      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      // Trigger animation by forcing reflow
      overlay.offsetHeight;
    },

    close: function () {
      var overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        overlay.classList.remove('open');
        overlay.remove();
      }
      document.body.style.overflow = '';
    }
  };
})();
