/**
 * NullSec — Article reader module
 * Handles the "Mark as read" state on article pages.
 *
 * The article page contains a button with id `mark-read-<slug>` and an
 * optional status element `read-status-<slug>`. This module derives the
 * slug from the button id, restores the saved state, and binds the toggle.
 */
(function () {
  'use strict';

  function slugFromId(id) {
    return id.replace(/^mark-read-/, '');
  }

  function setButtonState(btn, done) {
    let slug = slugFromId(btn.id);
    let status = document.getElementById('read-status-' + slug);
    btn.textContent = done ? '\u2713 Read' : 'Mark as read';
    if (done) btn.classList.add('done');
    else btn.classList.remove('done');
    if (status) status.style.display = done ? 'inline' : 'none';
  }

  function bindAll() {
    let btns = document.querySelectorAll('[id^="mark-read-"]');
    btns.forEach(function (btn) {
      let slug = slugFromId(btn.id);
      let done = Progress.isArticleRead(slug);
      setButtonState(btn, done);
      btn.addEventListener('click', function () {
        let wasDone = Progress.isArticleRead(slug);
        if (wasDone) Progress.unmarkArticleRead(slug);
        else Progress.markArticleRead(slug);
        setButtonState(btn, !wasDone);
      });
    });
  }

  function init() {
    bindAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
