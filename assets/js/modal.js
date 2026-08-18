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

  // --- Non-intrusive toast notification (Phase 5) -----------------------
  window.Modal.toast = (function () {
    let container = null;
    function ensureContainer() {
      if (!container) {
        container = document.createElement('div');
        container.className = 'ns-toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
      }
      return container;
    }
    return function (message, type) {
      const kinds = ['success', 'info', 'warning', 'error'];
      const kind = kinds.indexOf(type) !== -1 ? type : 'info';
      const box = document.createElement('div');
      box.className = 'ns-toast ns-toast--' + kind;
      box.textContent = message;
      box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      ensureContainer().appendChild(box);
      requestAnimationFrame(function () { box.classList.add('ns-toast--show'); });
      setTimeout(function () {
        box.classList.remove('ns-toast--show');
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 300);
      }, 3500);
      return box;
    };
  })();

  // --- Confirmation dialog (destructive/confirm actions) ----------------
  window.Modal.confirm = function (opts) {
    const o = opts || {};
    const title = o.title || 'Are you sure?';
    const message = o.message || '';
    const confirmText = o.confirmText || 'Confirm';
    const cancelText = o.cancelText || 'Cancel';
    const danger = o.danger === true;
    return new Promise(function (resolve) {
      let settled = false;
      const settle = function (val) {
        if (settled) return;
        settled = true;
        window.Modal.close();
        resolve(val);
      };
      const overlay = window.Modal.open('');
      overlay.className = 'modal-overlay open ns-confirm-overlay';
      const modal = overlay.querySelector('.modal');
      if (modal) {
        Utils.clear(modal);
        const body = Utils.el('div', { class: 'ns-confirm' });
        body.appendChild(Utils.el('h3', { class: 'ns-confirm-title', text: title }));
        if (message) body.appendChild(Utils.el('p', { class: 'ns-confirm-message', text: message }));
        const actions = Utils.el('div', { class: 'ns-confirm-actions' });
        const cancelBtn = Utils.el('button', { class: 'btn btn-secondary', text: cancelText });
        const okBtn = Utils.el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: confirmText });
        cancelBtn.addEventListener('click', function () { settle(false); });
        okBtn.addEventListener('click', function () { settle(true); });
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        body.appendChild(actions);
        modal.appendChild(body);
      }
      document.addEventListener('keydown', function onEscape(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onEscape); settle(false); }
      });
      overlay.addEventListener('click', function onClick(e) {
        if (e.target === overlay) { overlay.removeEventListener('click', onClick); settle(false); }
      });
      setTimeout(function () {
        const ok = overlay.querySelector('.ns-confirm-actions .btn-danger, .ns-confirm-actions .btn-primary');
        if (ok && ok.focus) ok.focus();
      }, 0);
    });
  };
})();
