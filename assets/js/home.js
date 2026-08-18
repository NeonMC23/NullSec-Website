/**
 * NullSec — Home module
 * Renders the homepage "Latest Article" featured card and the
 * "This Week's Mission" card (driven by the shared Journey module).
 */
(function () {
  'use strict';

  /* --- Featured article ------------------------------------------------- */
  function renderFeatured(articles) {
    let published = articles.filter(function (a) { return a.status === 'published'; });
    let featured = published[0];
    let container = document.getElementById('featured-article');
    if (!container || !featured) return;

    let featSlug = featured.url.replace('articles/', '').replace('.html', '');
    let featRead = Progress.isArticleRead(featSlug);

    let link = Utils.el('a', {
      href: featured.url,
      class: 'featured-article' + (featRead ? ' read' : '')
    });
    let img = Utils.el('img', {
      src: featured.cover || 'assets/images/placeholder.svg',
      class: 'featured-article-image',
      alt: featured.title
    });
    img.setAttribute('loading', 'lazy');
    link.appendChild(img);

    let body = Utils.el('div', { class: 'featured-article-body' });
    body.appendChild(Utils.el('span', { class: 'badge', text: 'Latest' }));
    body.appendChild(Utils.el('h3', { text: featured.title }));
    body.appendChild(Utils.el('p', { text: featured.description }));
    let meta = Utils.el('span', { class: 'article-card-meta' });
    meta.appendChild(Utils.el('span', { text: Utils.formatDate(featured.date) }));
    meta.appendChild(Utils.el('span', { class: 'dot' }));
    meta.appendChild(Utils.el('span', { text: featured.readingTime }));
    body.appendChild(meta);
    link.appendChild(body);

    Utils.clear(container);
    container.appendChild(link);
  }

  /* --- Weekly mission card (homepage-specific layout) ------------------- */
  function renderWeekly() {
    let el = document.getElementById('weekly-mission');
    if (!el || !window.Journey) return;
    let mission = Journey.getWeeklyMission();
    if (!mission) return;
    let done = Journey.isWeeklyDone();

    let left = Utils.el('div', {});
    left.appendChild(Utils.el('span', { class: 'badge', text: 'Community Mission' }));
    left.appendChild(Utils.el('h3', { text: mission.title }));
    left.appendChild(Utils.el('p', { text: mission.desc }));

    let meta = Utils.el('div', { class: 'weekly-mission-meta' });
    let timeItem = Utils.el('span', { class: 'meta-item' });
    timeItem.appendChild(document.createTextNode('\u23f0 '));
    timeItem.appendChild(Utils.el('strong', { text: mission.time }));
    meta.appendChild(timeItem);

    let diffItem = Utils.el('span', { class: 'meta-item' });
    diffItem.appendChild(document.createTextNode('Difficulty: '));
    let starsWrap = Utils.el('span', { class: 'stars' });
    for (let i = 0; i < 5; i++) starsWrap.appendChild(Utils.el('span', { text: i < mission.difficulty ? '\u2605' : '\u2606' }));
    diffItem.appendChild(starsWrap);
    meta.appendChild(diffItem);

    let impItem = Utils.el('span', { class: 'meta-item' });
    impItem.appendChild(document.createTextNode('Impact: '));
    let dotsWrap = Utils.el('span', { style: 'display:inline-flex;gap:3px;align-items:center;' });
    for (let j = 0; j < 5; j++) {
      dotsWrap.appendChild(Utils.el('span', {
        class: 'impact-dot' + (j < mission.impact ? ' filled' : ''),
        style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
          (j < mission.impact ? 'var(--accent)' : 'var(--bg-elevated)') +
          ';border:' + (j < mission.impact ? 'none' : '1px solid var(--border)') + ';'
      }));
    }
    impItem.appendChild(dotsWrap);
    meta.appendChild(impItem);
    left.appendChild(meta);

    let actions = Utils.el('div', { style: 'display:flex;gap:8px;align-items:start;justify-content:center;' });
    const authd = !!(window.Auth && window.Auth.isAuthenticated());
    // M30: guests cannot save mission completion — show a sign-in CTA instead.
    let toggleBtn;
    if (!authd) {
      toggleBtn = Utils.el('a', {
        href: 'profile.html',
        class: 'btn btn-primary',
        text: 'Create account to track progress'
      });
    } else {
      toggleBtn = Utils.el('button', {
        class: done ? 'btn btn-secondary' : 'btn btn-primary',
        text: done ? '\u2713 Completed' : 'Mark as done'
      });
      toggleBtn.addEventListener('click', function () {
        if (!window.Journey) return;
        Journey.toggleWeekly();
        renderWeekly();
      });
    }
    let viewAll = Utils.el('a', {
      href: 'journey.html',
      class: 'btn btn-secondary',
      style: 'min-height:40px;display:inline-flex;align-items:center;'
    });
    viewAll.appendChild(document.createTextNode('View all '));
    viewAll.appendChild(document.createTextNode('\u2192'));
    actions.appendChild(toggleBtn);
    actions.appendChild(viewAll);

    Utils.clear(el);
    el.appendChild(left);
    el.appendChild(actions);
  }

  /* --- Init ------------------------------------------------------------- */
  function init() {
    Data.loadArticles()
      .then(function (articles) { renderFeatured(articles); })
      .catch(function (err) { console.error('Home articles error:', err); });

    if (window.Journey) {
      Journey.onReady(renderWeekly);
    }

    // The weekly card is auth-aware (guests get a sign-in CTA, authenticated
    // users get "Mark as done"). The startup session restore is async, so we
    // re-render once it resolves and on any later auth change to avoid showing
    // a logged-out CTA to a logged-in user after navigation.
    if (window.Auth && Auth.onAuthChange) {
      Auth.onAuthChange(renderWeekly);
    }
    if (window.Session && Session.ensureRestored) {
      Session.ensureRestored().then(function () { renderWeekly(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
