/**
 * NullSec — Articles Module (V2)
 * Loads article metadata from /data/articles.json and renders
 * a clean article list. Shows published and in-progress separately.
 */

(function () {
  'use strict';

  function setupInProgressToggle() {
    let toggle = document.getElementById('in-progress-toggle');
    let list = document.getElementById('in-progress-list');
    if (!toggle || !list) return;
    toggle.addEventListener('click', function () {
      let open = list.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  async function loadArticles() {
    let list = document.getElementById('articles-list');
    let progressList = document.getElementById('in-progress-list');
    if (!list) return;
    setupInProgressToggle();

    try {
      let articles = await Data.loadArticles();

      let published = articles.filter(function (a) { return a.status !== 'in-progress'; });
      let inProgress = articles.filter(function (a) { return a.status === 'in-progress'; });

      renderList(published, list);
      if (progressList) {
        renderProgressList(inProgress, progressList);
      }
      setupSort(published, list);
    } catch (err) {
      Utils.clear(list);
      list.appendChild(Utils.el('p', { style: 'color: var(--text-dim);', text: 'Failed to load articles.' }));
      console.error('Articles load error:', err);
    }
  }

  function renderList(articles, container) {
    Utils.clear(container);
    if (!articles.length) {
      container.appendChild(Utils.el('p', {
        style: 'color: var(--text-dim); padding: 20px;',
        text: 'No articles yet. Check back soon.'
      }));
      return;
    }

    articles.forEach(function (a) {
      let slug = a.url.replace('articles/', '').replace('.html', '');
      let isRead = Progress.isArticleRead(slug);
      let item = Utils.el('a', { href: a.url, class: 'article-list-item' + (isRead ? ' read' : '') });
      let left = Utils.el('div', { class: 'item-left' });
      left.appendChild(Utils.el('h3', { text: a.title }));
      left.appendChild(Utils.el('p', { text: a.description }));
      item.appendChild(left);
      let right = Utils.el('div', { class: 'item-right' });
      right.appendChild(Utils.el('span', { class: 'cat', text: a.category }));
      right.appendChild(Utils.el('span', { text: Utils.formatDate(a.date) }));
      right.appendChild(Utils.el('span', { text: a.readingTime }));
      item.appendChild(right);
      container.appendChild(item);
    });
  }

  function renderProgressList(articles, container) {
    Utils.clear(container);
    if (!articles.length) {
      container.appendChild(Utils.el('p', {
        style: 'color: var(--text-dim); padding: 12px 20px;',
        text: 'No upcoming articles planned.'
      }));
      return;
    }
    articles.forEach(function (a) {
      let item = Utils.el('div', { class: 'in-progress-item' });
      item.appendChild(Utils.el('h4', { text: a.title }));
      item.appendChild(Utils.el('span', { class: 'eta', text: a.category }));
      container.appendChild(item);
    });
  }

  function setupSort(articles, container) {    let sortSelect = document.getElementById('sort-select');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', function () {
      let sorted = [].concat(articles);
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
