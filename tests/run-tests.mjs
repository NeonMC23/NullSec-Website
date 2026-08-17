/**
 * NullSec — Milestone 14 test harness (Node, no browser).
 * Loads the vanilla-JS modules with a small DOM / storage / fetch shim and
 * validates offline-first behavior, session persistence & restoration,
 * recovery-key storage, and ApiClient error classification.
 *
 * NOTE: these are LOCAL / MOCKED tests. No real Supabase project is touched.
 * Real-deployment tests are documented separately (blocked without a project).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets', 'js');

// Static datasets served to the fetch shim (for offline UI tests).
const DATASETS = {
  articles: JSON.parse(readFileSync(join(ROOT, 'data', 'articles.json'), 'utf8')),
  missions: JSON.parse(readFileSync(join(ROOT, 'data', 'missions.json'), 'utf8')),
  tools: JSON.parse(readFileSync(join(ROOT, 'data', 'tools.json'), 'utf8')),
  countries: JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8'))
};

/* ------------------------------------------------------------------ *
 * Shims                                                               *
 * ------------------------------------------------------------------ */
/** Minimal DOM node shim for SVG rendering tests. */
function makeShimElement() {
  const children = [];
  const attrs = {};
  const node = {
    children: children,
    attrs: attrs,
    dataset: {},
    style: {},
    _text: '',
    tagName: '',
    appendChild(child) { children.push(child); return child; },
    remove() {},
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    querySelector(sel) {
      // support "#id"
      if (sel && sel[0] === '#') {
        return children.find(c => c.attrs && c.attrs.id === sel.slice(1)) || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel && sel.indexOf('#') === 0) {
        const r = this.querySelector(sel);
        return r ? [r] : [];
      }
      return children;
    },
    addEventListener() {},
    removeChild() {}
  };
  return node;
}

function makeStorage(backing) {
  const store = backing || {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
    _backing: store
  };
}

export function makeHarness(opts = {}) {
  const calls = { fetch: [] };
  const localBacking = {};
  const sessionBacking = {};

  // Configurable fake Supabase backend.
  const backend = opts.backend || {
    register: () => ({ token: 'mock-token-123', user_id: 1 }),
    login: () => ({ token: 'mock-token-123', user_id: 1 }),
    validate: (token) => (token === 'mock-token-123' ? 1 : null),
    logout: () => ({ ok: true })
  };

  const global = {
    window: null, // filled below
    document: {
      readyState: 'complete',
      documentElement: { setAttribute() {}, removeAttribute() {} },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeShimElement(),
      createElementNS: (ns, tag) => makeShimElement(),
      createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
      addEventListener() {}, body: { appendChild() {} }
    },
    navigator: { onLine: opts.online !== false },
    location: { protocol: 'https:', hostname: 'example.test' },
    localStorage: makeStorage(localBacking),
    sessionStorage: makeStorage(sessionBacking),
    TextEncoder: globalThis.TextEncoder,
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    confirm: () => true,
    alert: () => {},
    matchMedia: () => ({ matches: false }),
    console: console,
    fetch: (url, init) => {
      calls.fetch.push({ url: String(url), init: init || {} });
      if (backend.fetch) return backend.fetch(url, init);
      const u = String(url);
      // Serve static dataset JSON for offline UI tests.
      const dataMatch = /^data\/([a-z]+)\.json$/.exec(u);
      if (dataMatch && DATASETS[dataMatch[1]]) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(DATASETS[dataMatch[1]]),
          text: () => Promise.resolve(JSON.stringify(DATASETS[dataMatch[1]]))
        });
      }
      let body = {};
      try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      const routed = [
        ['ns_register', 'register'], ['ns_login', 'login'], ['ns_recover', 'recover'],
        ['ns_validate_session', 'validate'],
        ['ns_logout', 'logout'], ['ns_sync_pull', 'syncPull'], ['ns_sync_push', 'syncPush'],
        ['ns_activity', 'activity'], ['ns_metrics', 'metrics'], ['ns_country_metrics', 'countryMetrics'],
        ['ns_tool_activity', 'toolActivity'], ['ns_update_profile', 'updateProfile'],
        ['ns_record_activity', 'recordActivity'],
        ['ns_change_password', 'changePassword'], ['ns_reset_progress', 'resetProgress'],
        ['ns_public_profile', 'publicProfile'], ['ns_update_public_profile', 'updatePublicProfile']
      ];
      for (const [tag, method] of routed) {
        if (u.indexOf(tag) !== -1) {
          if (typeof backend[method] !== 'function') return mockRespond(200, {});
          try {
            const arg = (method === 'validate') ? body.p_token : body;
            return mockRespond(200, backend[method](arg));
          } catch (e) { return mockRespond(e.status || 500, { message: e.message || 'error' }); }
        }
      }
      return mockRespond(200, {});
    }
  };
  // node: webcrypto available on globalThis in Node >= 18
  global.crypto = globalThis.crypto;
  global.window = global;

  const ctx = vm.createContext(global);

  function runFile(name) {
    const code = readFileSync(join(JS, name), 'utf8');
    vm.runInContext(code, ctx, { filename: name });
  }

  function load(order) {
    for (const f of order) runFile(f);
  }

  function resetFetch() { calls.fetch.length = 0; }

  return {
    global,
    ctx,
    calls,
    localBacking,
    sessionBacking,
    load,
    runFile,
    resetFetch,
    W: (name) => global[name]
  };
}

export function mockRespond(status, body) {
  const text = JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text)
  });
}

export const LOAD_ORDER = [
  'store.js',
  'session-store.js',
  'utils.js',
  'data-loader.js',
  'config.js',
  'repositories/identity-repository.js',
  'repositories/profile-repository.js',
  'repositories/progress-repository.js',
  'repositories/settings-repository.js',
  'repositories/country-repository.js',
  'identity.js',
  'user-state.js',
  'progress-service.js',
  'user-profile.js',
  'recovery-key.js',
  'settings-service.js',
  'auth-service.js',
  'api-client.js',
  'sync-resolver.js',
  'sync-service.js',
  'session-service.js',
  'activity-service.js',
  'community-action-service.js',
  'community-service.js',
  'mission-discovery.js',
  'challenge-service.js',
  'community-ranking.js',
  'community-metrics.js',
  'statistics-service.js',
  'country-metrics.js',
  'country-service.js',
  'europe-map.js'
];

/* ------------------------------------------------------------------ *
 * Assertions                                                          *
 * ------------------------------------------------------------------ */
let passed = 0, failed = 0;
const failures = [];
export function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error('  ✗ FAIL: ' + msg); }
}
export function eq(a, b, msg) {
  const cond = a === b;
  ok(cond, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);
}
export function summary() {
  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  return failed === 0;
}
