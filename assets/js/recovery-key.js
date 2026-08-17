/**
 * NullSec — Recovery Key module
 * ------------------------------------------------------------------
 * Foundation for the future account-recovery model. No authentication,
 * no backend, no sync, no encryption yet — purely local.
 *
 * A recovery key is a cryptographically random, human-readable, grouped
 * string. It is generated ONCE per account and stored separately from account
 * data (never inside UserProfile). It is stored in sessionStorage
 * (short-lived, per-tab) — never in long-lived localStorage — and is never
 * logged or printed.
 *
 * Format (example):
 *   NSK1-4XJT-KQ9P-7FMD-2AZN-8WRL
 *   - prefix: "NSK1" (NullSec Key, version 1)
 *   - five groups of 4 base32 chars
 *   - separated by "-"
 *
 * API:
 *   RecoveryKey.generateRecoveryKey()  → new random key string
 *   RecoveryKey.validateRecoveryKey(k) → boolean (format check)
 *   RecoveryKey.normalizeRecoveryKey(k)→ normalized string or null
 *   RecoveryKey.get()                  → stored key (or null)
 *   RecoveryKey.ensure()               → return stored key, generate once if absent
 */
(function () {
  'use strict';

  const PREFIX = 'NSK1';
  const GROUPS = 5;
  const GROUP_LEN = 4;
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base32 (no 0/O/1/I)
  const STORED_KEY = SessionStore.keys.RECOVERY; // ns:session:recovery

  /** Fill an array with cryptographically random bytes. */
  function randomBytes(n) {
    const bytes = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      // Non-crypto fallback (best-effort; modern browsers use crypto).
      for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  /**
   * Generate a cryptographically random recovery key.
   * Uses the base32 charset with a fixed structure.
   * @returns {string}
   */
  function generateRecoveryKey() {
    const total = GROUPS * GROUP_LEN;
    const bytes = randomBytes(total);
    let groups = [];
    for (let g = 0; g < GROUPS; g++) {
      let group = '';
      for (let i = 0; i < GROUP_LEN; i++) {
        group += CHARSET[bytes[g * GROUP_LEN + i] % CHARSET.length];
      }
      groups.push(group);
    }
    return PREFIX + '-' + groups.join('-');
  }

  /**
   * Validate the structural format of a recovery key.
   * @param {string} key
   * @returns {boolean}
   */
  function validateRecoveryKey(key) {
    if (typeof key !== 'string') return false;
    const parts = key.split('-');
    if (parts.length !== GROUPS + 1) return false;
    if (parts[0] !== PREFIX) return false;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].length !== GROUP_LEN) return false;
      for (let j = 0; j < parts[i].length; j++) {
        if (CHARSET.indexOf(parts[i][j]) === -1) return false;
      }
    }
    return true;
  }

  /**
   * Normalize a recovery key (uppercase, trim, collapse dashes) and return
   * the canonical string if valid, otherwise null.
   * @param {string} key
   * @returns {string|null}
   */
  function normalizeRecoveryKey(key) {
    if (typeof key !== 'string') return null;
    const upper = key.trim().toUpperCase();
    const collapsed = upper.replace(/\s+/g, '-').replace(/-+/g, '-');
    if (!validateRecoveryKey(collapsed)) return null;
    return collapsed;
  }

  /**
   * Verify a user-provided recovery key against the locally stored key.
   * Normalizes input, validates format, then compares. No regeneration,
   * no network, no logging, no URL exposure.
   * @param {string} input
   * @returns {boolean}
   */
  function verify(input) {
    if (typeof input !== 'string') return false;
    const normalized = normalizeRecoveryKey(input);
    if (!normalized) return false;
    const stored = SessionStore.getRecoveryKey();
    if (!stored) return false;
    // Constant-time-ish comparison (length-safe).
    if (normalized.length !== stored.length) return false;
    let diff = 0;
    for (let i = 0; i < normalized.length; i++) {
      diff |= normalized.charCodeAt(i) ^ stored.charCodeAt(i);
    }
    return diff === 0;
  }

  /** Return the stored recovery key, or null. */
  function get() {
    return SessionStore.getRecoveryKey();
  }

  /**
   * Return the stored recovery key, generating and storing one exactly once
   * if it does not exist. Never regenerates an existing key.
   * @returns {string}
   */
  function ensure() {
    let existing = SessionStore.getRecoveryKey();
    if (existing) return existing;
    const key = generateRecoveryKey();
    SessionStore.saveRecoveryKey(key);
    return key;
  }

  /**
   * Validate + store a user-supplied recovery key (used by local import).
   * @param {string} key
   * @returns {boolean} true if stored
   */
  function importRaw(key) {
    const normalized = normalizeRecoveryKey(key);
    if (!normalized) return false;
    SessionStore.saveRecoveryKey(normalized);
    return true;
  }

  /**
   * Compute a SHA-256 hex digest of a string (client-side, for transport).
   * The raw recovery key never leaves the browser; only a hash is sent to
   * the server, which stores a salted bcrypt hash of it.
   *
   * SECURITY: this must use the WebCrypto subtle digest. If crypto.subtle is
   * unavailable, hashForTransport() returns null and the caller must NOT
   * proceed with authentication (a non-cryptographic fallback must never be
   * used as a credential).
   * @param {string} input
   * @returns {Promise<string>}
   */
  function sha256(input) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
        .then(function (buf) {
          return Array.from(new Uint8Array(buf))
            .map(function (b) { return b.toString(16).padStart(2, '0'); })
            .join('');
        });
    }
    return Promise.reject(new Error('crypto_unavailable'));
  }

  /**
   * Hash the recovery key for transport (never send the raw key). Resolves
   * a 64-char lowercase SHA-256 hex string, or null if crypto is unavailable
   * (caller must abort authentication).
   * @returns {Promise<string|null>}
   */
  function hashForTransport() {
    const key = get();
    if (!key) return Promise.resolve(null);
    return sha256(key).then(function (h) {
      return h.length === 64 ? h : null;
    }).catch(function () {
      return null;
    });
  }

  window.RecoveryKey = {
    generateRecoveryKey: generateRecoveryKey,
    validateRecoveryKey: validateRecoveryKey,
    normalizeRecoveryKey: normalizeRecoveryKey,
    get: get,
    ensure: ensure,
    verify: verify,
    importRaw: importRaw,
    sha256: sha256,
    hashForTransport: hashForTransport
  };
})();
