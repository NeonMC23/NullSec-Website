/**
 * NullSec — Articles Module (V2)
 * Loads article metadata from /data/articles.json and renders
 * a clean article list. Shows published and in-progress separately.
 */

(function () {
  'use strict';

  async function loadArticles() {
    var list = document.getElementById('articles-list');
    var progressList = document.getElementById('in-progress-list');
    if (!list) return;

    try {
      var res = await fetch('data/articles.json');
      var articles = await res.json();

      var published = articles.filter(function (a) { return a.status !== 'in-progress'; });
      var inProgress = articles.filter(function (a) { return a.status === 'in-progress'; });

      renderList(published, list);
      if (progressList) {
        renderProgressList(inProgress, progressList);
      }
      setupSort(published, list);
    } catch (err) {
      list.innerHTML = '<p style="color: var(--text-dim);">Failed to load articles.</p>';
      console.error('Articles load error:', err);
    }
  }

  function renderList(articles, container) {
    if (!articles.length) {
      container.innerHTML = '<p style="color: var(--text-dim); padding: 20px;">No articles yet. Check back soon.</p>';
      return;
    }

    container.innerHTML = articles.map(function (a) {
      var readKey = 'ns-article-' + a.url.replace('articles/', '').replace('.html', '');
      var isRead = localStorage.getItem(readKey) === 'done';
      return '<a href="' + a.url + '" class="article-list-item' + (isRead ? ' read' : '') + '">' +
        '<div class="item-left">' +
          '<h3>' + Utils.sanitize(a.title) + '</h3>' +
          '<p>' + Utils.sanitize(a.description) + '</p>' +
        '</div>' +
        '<div class="item-right">' +
          '<span class="cat">' + Utils.sanitize(a.category) + '</span>' +
          '<span>' + Utils.formatDate(a.date) + '</span>' +
          '<span>' + a.readingTime + '</span>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  function renderProgressList(articles, container) {
    if (!articles.length) {
      container.innerHTML = '<p style="color: var(--text-dim); padding: 12px 20px;">No upcoming articles planned.</p>';
      return;
    }
    container.innerHTML = articles.map(function (a) {
      return '<div class="in-progress-item">' +
        '<h4>' + Utils.sanitize(a.title) + '</h4>' +
        '<span class="eta">' + Utils.sanitize(a.category) + '</span>' +
      '</div>';
    }).join('');
  }

  function setupSort(articles, container) {
    var sortSelect = document.getElementById('sort-select');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', function () {
      var sorted = [].concat(articles);
      switch (sortSelect.value) {
        case 'newest':
          sorted.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
          break;
        case 'oldest':
          sorted.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
          break;
        case 'category':
          sorted.sort(function (a, b) { return a.category.localeCompare(b.category); });
          break;
      }
      renderList(sorted, container);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadArticles);
  } else {
    loadArticles();
  }
})();
