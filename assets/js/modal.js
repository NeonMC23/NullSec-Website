/**
 * NullSec — Modal System
 * Clean overlay modal for mission details, tool details, etc.
 *
 * `open(content)` accepts either a DOM Node (preferred, built safely by the
 * caller) or an HTML string. A string is treated as trusted HTML — callers
 * must only pass their own first-party markup, never user input.
 *
 * Returns the overlay element so callers can bind their own action buttons.
 */
(function () {
  'use strict';

  window.Modal = {
    open: function (content) {
      let existing = document.querySelector('.modal-overlay');
      if (existing) {
        existing.classList.remove('open');
        setTimeout(function () { existing.remove(); }, 200);
      }

      let overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Dialog');

      let modal = document.createElement('div');
      modal.className = 'modal';

      let closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function () {
        window.Modal.close();
      });
      modal.appendChild(closeBtn);

      if (typeof content === 'string') {
        let wrapper = document.createElement('div');
        wrapper.innerHTML = content; // trusted HTML
        modal.appendChild(wrapper);
      } else {
        modal.appendChild(content);
      }

      overlay.appendChild(modal);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) window.Modal.close();
      });

      document.addEventListener('keydown', function onEscape(e) {
        if (e.key === 'Escape') {
          window.Modal.close();
          document.removeEventListener('keydown', onEscape);
        }
      });

      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      // Trigger animation by forcing reflow
      overlay.offsetHeight;

      // Basic focus management: move focus to the dialog on open so keyboard
      // users land inside it (lightweight; not a full focus-trap).
      if (closeBtn && closeBtn.focus) {
        setTimeout(function () { closeBtn.focus(); }, 0);
      }

      return overlay;
    },

    close: function () {
      let overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        overlay.classList.remove('open');
        overlay.remove();
      }
      document.body.style.overflow = '';
    }
  };
})();
