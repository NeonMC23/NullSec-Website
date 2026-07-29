/**
 * NullSec — Tools Library
 * Searchable, filterable database of privacy tools and software.
 */

(function () {
  'use strict';

  var TOOLS = [
    { name: 'Signal', desc: 'End-to-end encrypted messaging. The gold standard for private communication.', url: 'https://signal.org', category: 'Messaging', openSource: true, free: true, difficulty: 1 },
    { name: 'ProtonMail', desc: 'Encrypted email service based in Switzerland. End-to-end encryption by default.', url: 'https://proton.me/mail', category: 'Email', openSource: true, free: true, difficulty: 1 },
    { name: 'Proton Drive', desc: 'End-to-end encrypted cloud storage. Zero-knowledge architecture.', url: 'https://proton.me/drive', category: 'Cloud Storage', openSource: true, free: true, difficulty: 1 },
    { name: 'Mullvad VPN', desc: 'Privacy-first VPN with a fixed monthly price, no email required.', url: 'https://mullvad.net', category: 'VPN', openSource: true, free: false, difficulty: 2 },
    { name: 'ProtonVPN', desc: 'Swiss-based VPN with a free tier. Strong privacy, no logs.', url: 'https://protonvpn.com', category: 'VPN', openSource: true, free: true, difficulty: 1 },
    { name: 'Bitwarden', desc: 'Open source password manager with self-hosting option. Cross-platform.', url: 'https://bitwarden.com', category: 'Password Managers', openSource: true, free: true, difficulty: 1 },
    { name: 'KeePassXC', desc: 'Offline password manager. Fully open source, local storage only.', url: 'https://keepassxc.org', category: 'Password Managers', openSource: true, free: true, difficulty: 2 },
    { name: 'Tor Browser', desc: 'Browse the web anonymously. Routes traffic through the Tor network.', url: 'https://torproject.org', category: 'Browsers', openSource: true, free: true, difficulty: 2 },
    { name: 'Firefox', desc: 'Privacy-focused browser from Mozilla. Open source, extensible, cross-platform.', url: 'https://firefox.com', category: 'Browsers', openSource: true, free: true, difficulty: 1 },
    { name: 'Brave', desc: 'Privacy-first browser with built-in ad blocking and Tor integration.', url: 'https://brave.com', category: 'Browsers', openSource: true, free: true, difficulty: 1 },
    { name: 'DuckDuckGo', desc: 'Private search engine. No tracking, no personalization, same great results.', url: 'https://duckduckgo.com', category: 'Search Engines', openSource: false, free: true, difficulty: 1 },
    { name: 'Quad9', desc: 'Free DNS service that blocks malicious domains. No logging, privacy-first.', url: 'https://quad9.net', category: 'DNS', openSource: false, free: true, difficulty: 2 },
    { name: 'NextDNS', desc: 'Advanced DNS filtering with customizable blocklists and analytics.', url: 'https://nextdns.io', category: 'DNS', openSource: false, free: true, difficulty: 2 },
    { name: 'uvu', desc: 'Linux distribution. Great for beginners, massive community, vast software repository.', url: 'https://ubuntu.com', category: 'Linux', openSource: true, free: true, difficulty: 2 },
    { name: 'Arch Linux', desc: 'Lightweight, flexible Linux distribution. Full control over your system.', url: 'https://archlinux.org', category: 'Linux', openSource: true, free: true, difficulty: 4 },
    { name: 'Fedora', desc: 'Cutting-edge Linux distribution by Red Hat. Excellent for developers.', url: 'https://getfedora.org', category: 'Linux', openSource: true, free: true, difficulty: 3 },
    { name: 'Debian', desc: 'The universal operating system. Known for stability and vast package repository.', url: 'https://debian.org', category: 'Linux', openSource: true, free: true, difficulty: 3 },
    { name: 'GrapheneOS', desc: 'Privacy-hardened Android OS. No Google services, maximum security.', url: 'https://grapheneos.org', category: 'Operating Systems', openSource: true, free: true, difficulty: 4 },
    { name: 'Nextcloud', desc: 'Self-hosted productivity platform. Files, calendar, contacts, chat, and more.', url: 'https://nextcloud.com', category: 'Self-Hosting', openSource: true, free: true, difficulty: 3 },
    { name: 'Pi-hole', desc: 'Network-wide ad blocking and DNS sinkhole. Runs on Raspberry Pi or any Linux.', url: 'https://pi-hole.net', category: 'Self-Hosting', openSource: true, free: true, difficulty: 3 },
    { name: 'Syncthing', desc: 'Continuous file synchronization between devices. No central server required.', url: 'https://syncthing.net', category: 'Self-Hosting', openSource: true, free: true, difficulty: 3 },
    { name: 'Tailscale', desc: 'Zero-config VPN built on WireGuard. Perfect for connecting self-hosted services.', url: 'https://tailscale.com', category: 'Networking', openSource: true, free: true, difficulty: 2 },
    { name: 'WireGuard', desc: 'Modern, fast, and secure VPN protocol. Simpler and faster than OpenVPN.', url: 'https://wireguard.com', category: 'Networking', openSource: true, free: true, difficulty: 3 },
    { name: 'Wireshark', desc: 'Network protocol analyzer. Essential for understanding network traffic.', url: 'https://wireshark.org', category: 'Networking', openSource: true, free: true, difficulty: 4 },
    { name: 'Ollama', desc: 'Run large language models locally. Privacy-first AI with no cloud dependency.', url: 'https://ollama.ai', category: 'Artificial Intelligence', openSource: true, free: true, difficulty: 3 },
    { name: 'LocalAI', desc: 'Self-hosted, OpenAI-compatible API for LLMs, image generation, and more.', url: 'https://localai.io', category: 'Artificial Intelligence', openSource: true, free: true, difficulty: 4 },
    { name: 'YubiKey', desc: 'Hardware security key. The strongest form of two-factor authentication.', url: 'https://yubico.com', category: 'Security', openSource: false, free: false, difficulty: 2 },
    { name: 'Authy', desc: 'Two-factor authentication app with backup and multi-device sync.', url: 'https://authy.com', category: 'Two-Factor Authentication', openSource: false, free: true, difficulty: 1 },
    { name: 'Ente Auth', desc: 'Open source 2FA app with end-to-end encrypted backups.', url: 'https://ente.io/auth', category: 'Two-Factor Authentication', openSource: true, free: true, difficulty: 1 },
    { name: 'Cryptomator', desc: 'Encrypt files before uploading to any cloud. Zero-knowledge, open source.', url: 'https://cryptomator.org', category: 'Cloud Storage', openSource: true, free: true, difficulty: 2 },
    { name: 'Jellyfin', desc: 'Free and open source media server. Alternative to Plex and Emby.', url: 'https://jellyfin.org', category: 'Self-Hosting', openSource: true, free: true, difficulty: 3 },
    { name: 'Home Assistant', desc: 'Open source home automation platform. All your smart devices locally.', url: 'https://home-assistant.io', category: 'Self-Hosting', openSource: true, free: true, difficulty: 3 },
    { name: 'VSCodium', desc: 'Free, open source code editor. Community-driven, telemetry-free VS Code.', url: 'https://vscodium.com', category: 'Development', openSource: true, free: true, difficulty: 2 },
    { name: 'Joplin', desc: 'Open source note-taking app with end-to-end encryption. Evernote alternative.', url: 'https://joplinapp.org', category: 'Productivity', openSource: true, free: true, difficulty: 2 },
    { name: 'Standard Notes', desc: 'Encrypted notes app. Simple, secure, cross-platform.', url: 'https://standardnotes.com', category: 'Productivity', openSource: true, free: true, difficulty: 1 },
    { name: 'GIMP', desc: 'GNU Image Manipulation Program. Free and open source Photoshop alternative.', url: 'https://gimp.org', category: 'Development', openSource: true, free: true, difficulty: 3 },
    { name: 'OpenWrt', desc: 'Open source router OS. Full control over your home network.', url: 'https://openwrt.org', category: 'Networking', openSource: true, free: true, difficulty: 4 },
    { name: 'Element', desc: 'Decentralized chat client for the Matrix protocol. Encrypted by default.', url: 'https://element.io', category: 'Messaging', openSource: true, free: true, difficulty: 2 },
    { name: 'SimpleLogin', desc: 'Email aliases to protect your real address. Open source and self-hostable.', url: 'https://simplelogin.io', category: 'Email', openSource: true, free: true, difficulty: 2 },
    { name: 'Have I Been Pwned', desc: 'Check if your email or passwords have been leaked in data breaches.', url: 'https://haveibeenpwned.com', category: 'Security', openSource: false, free: true, difficulty: 1 },
  ];

  var allCategories = [...new Set(TOOLS.map(function (t) { return t.category; }))].sort();

  function renderTools(tools) {
    var container = document.getElementById('tools-grid');
    if (!container) return;
    if (!tools.length) {
      container.innerHTML = '<p style="color: var(--text-dim); text-align: center; grid-column: 1/-1; padding: 40px;">No tools found matching your search.</p>';
      return;
    }
    container.innerHTML = tools.map(function (t) {
      var openSrc = t.openSource ? '<span class="meta-tag open-source">Open Source</span>' : '';
      var freeTag = t.free ? '<span class="meta-tag free">Free</span>' : '';
      var diff = '';
      for (var i = 0; i < t.difficulty; i++) diff += '&#9679;';
      return '<div class="tool-card">' +
        '<div class="tool-top"><h3>' + Utils.sanitize(t.name) + '</h3><span class="tool-category">' + Utils.sanitize(t.category) + '</span></div>' +
        '<p>' + Utils.sanitize(t.desc) + '</p>' +
        '<div class="tool-meta">' +
          '<span class="meta-tag">Difficulty: ' + diff + '</span>' +
          openSrc + freeTag +
        '</div>' +
        '<div class="tool-links">' +
          '<a href="' + t.url + '" target="_blank" rel="noopener">Visit website &#8599;</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderCategories(active) {
    var container = document.getElementById('tools-categories');
    if (!container) return;
    var html = '<button class="tools-cat-btn' + (active === 'all' ? ' active' : '') + '" data-cat="all">All</button>';
    allCategories.forEach(function (cat) {
      html += '<button class="tools-cat-btn' + (active === cat ? ' active' : '') + '" data-cat="' + cat + '">' + cat + '</button>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.tools-cat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = this.getAttribute('data-cat');
        container.querySelectorAll('.tools-cat-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        filterAndRender();
      });
    });
  }

  function filterAndRender() {
    var search = (document.getElementById('tools-search').value || '').toLowerCase();
    var activeCat = document.querySelector('.tools-cat-btn.active');
    var cat = activeCat ? activeCat.getAttribute('data-cat') : 'all';

    var filtered = TOOLS.filter(function (t) {
      var matchCat = cat === 'all' || t.category === cat;
      var matchSearch = !search || t.name.toLowerCase().indexOf(search) !== -1 ||
        t.desc.toLowerCase().indexOf(search) !== -1 ||
        t.category.toLowerCase().indexOf(search) !== -1;
      return matchCat && matchSearch;
    });

    renderTools(filtered);
  }

  function init() {
    renderCategories('all');
    renderTools(TOOLS);

    var searchInput = document.getElementById('tools-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(filterAndRender, 150));
    }

    // Handle URL category param
    var params = new URLSearchParams(window.location.search);
    var urlCat = params.get('category');
    if (urlCat) {
      var btns = document.querySelectorAll('.tools-cat-btn');
      btns.forEach(function (b) {
        if (b.getAttribute('data-cat') === urlCat) {
          b.click();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
