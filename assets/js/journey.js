/**
 * NullSec — Learning Journey
 * Interactive mission system with localStorage progress tracking.
 * No account required. All data stays on your device.
 */

(function () {
  'use strict';

  var MISSIONS = [
    // Stage 1: Getting Started
    {
      id: 'enable-2fa',
      stage: 1,
      title: 'Enable Two-Factor Authentication',
      desc: 'Add a second layer of security to your accounts. Prevents hackers from accessing your accounts even if they have your password.',
      detail: '<p>Two-factor authentication (2FA) adds a second step to your login process. Even if someone steals your password, they cannot access your account without the second factor.</p><p><strong>How to enable it:</strong></p><ul><li>Go to your account security settings (Google, Apple, Microsoft, etc.)</li><li>Look for "Two-Step Verification" or "2FA"</li><li>Choose an authenticator app (Google Authenticator, Authy) or security key</li><li>Scan the QR code and enter the code shown</li></ul><p><strong>Pro tip:</strong> Use an authenticator app instead of SMS when possible. SMS can be intercepted.</p>',
      time: '5 min',
      difficulty: 1,
      impact: 5,
      icon: '🔐',
      prerequisites: []
    },
    {
      id: 'password-manager',
      stage: 1,
      title: 'Install a Password Manager',
      desc: 'Stop reusing passwords. A password manager generates strong, unique passwords for every account and remembers them for you.',
      detail: '<p>A password manager is like a secure digital vault. It creates strong passwords, stores them safely, and auto-fills them when you need to log in.</p><p><strong>Recommended:</strong> Bitwarden (free, open source) or KeePassXC</p><p><strong>Quick start:</strong></p><ul><li>Download Bitwarden from <a href="https://bitwarden.com" target="_blank" rel="noopener">bitwarden.com</a></li><li>Create a master password (make it strong!)</li><li>Install the browser extension</li><li>Start saving your logins</li></ul>',
      time: '10 min',
      difficulty: 2,
      impact: 5,
      icon: '🔑',
      prerequisites: []
    },
    {
      id: 'ublock-origin',
      stage: 1,
      title: 'Install uBlock Origin',
      desc: 'Block ads, trackers, and malware. One of the most effective privacy tools you can install — and it takes two minutes.',
      detail: '<p>uBlock Origin is a free, open-source browser extension that blocks ads, trackers, clickbait, and malware domains. It uses less memory than most other ad blockers.</p><p><strong>Installation:</strong></p><ul><li>Firefox: <a href="https://addons.mozilla.org/firefox/addon/ublock-origin/" target="_blank" rel="noopener">Add to Firefox</a></li><li>Chrome/Edge/Brave: <a href="https://chrome.google.com/webstore/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm" target="_blank" rel="noopener">Chrome Web Store</a></li></ul><p>Once installed, it works automatically. No configuration needed.</p>',
      time: '2 min',
      difficulty: 1,
      impact: 5,
      icon: '🛡️',
      prerequisites: []
    },
    {
      id: 'check-leaks',
      stage: 1,
      title: 'Check If Your Email Has Leaked',
      desc: 'Find out if your accounts have been compromised in data breaches. Free, fast, and eye-opening.',
      detail: '<p>Data breaches happen constantly. Your email and passwords may already be circulating online without your knowledge.</p><p><strong>Check now:</strong></p><ul><li>Visit <a href="https://haveibeenpwned.com" target="_blank" rel="noopener">haveibeenpwned.com</a></li><li>Enter your email address</li><li>See which breaches you appear in</li></ul><p>If your email has been leaked, change the password for that account immediately. Use your new password manager!</p>',
      time: '1 min',
      difficulty: 1,
      impact: 4,
      icon: '🔍',
      prerequisites: []
    },
    {
      id: 'switch-signal',
      stage: 1,
      title: 'Switch to Signal',
      desc: 'Replace WhatsApp or Messenger with end-to-end encrypted messaging. Signal is private by design and completely free.',
      detail: '<p>Signal is widely considered the gold standard for private messaging. It uses end-to-end encryption for everything — messages, calls, video, and file sharing.</p><p><strong>Why Signal:</strong></p><ul><li>End-to-end encryption by default</li><li>Open source and audited</li><li>Nonprofit, no ads, no data collection</li><li>Minimal metadata collection</li></ul><p><strong>Get it:</strong> <a href="https://signal.org/download/" target="_blank" rel="noopener">signal.org/download/</a></p>',
      time: '5 min',
      difficulty: 1,
      impact: 4,
      icon: '💬',
      prerequisites: []
    },
    {
      id: 'browser-privacy',
      stage: 1,
      title: 'Tweak Your Browser Privacy',
      desc: 'Simple browser settings changes that make a big difference. No extensions required.',
      detail: '<p>Modern browsers have built-in privacy features. Here is how to enable them:</p><p><strong>Firefox:</strong></p><ul><li>Go to Settings &gt; Privacy &amp; Security</li><li>Set Enhanced Tracking Protection to "Strict"</li><li>Enable "HTTPS-Only Mode"</li><li>Disable "Allow Firefox to send technical data"</li></ul><p><strong>Brave:</strong></p><ul><li>Brave is private by default. Check Shields are enabled (lion icon in address bar)</li><li>Set to "Aggressive" blocking for maximum privacy</li></ul>',
      time: '3 min',
      difficulty: 1,
      impact: 3,
      icon: '🌐',
      prerequisites: []
    },
    // Stage 2: Build Better Habits
    {
      id: 'change-search',
      stage: 2,
      title: 'Change Your Search Engine',
      desc: 'Switch from Google to a privacy-respecting search engine. Same results, no tracking.',
      detail: '<p>Search engines track everything you search. DuckDuckGo does not track you at all.</p><p><strong>How to switch:</strong></p><ul><li>Visit <a href="https://duckduckgo.com" target="_blank" rel="noopener">duckduckgo.com</a></li><li>Go to browser settings &gt; Search engine</li><li>Select DuckDuckGo as default</li></ul><p>Other options: Brave Search, SearXNG (self-hosted), Startpage.</p>',
      time: '2 min',
      difficulty: 1,
      impact: 3,
      icon: '🔎',
      prerequisites: []
    },
    {
      id: 'dns-privacy',
      stage: 2,
      title: 'Configure Private DNS',
      desc: 'Replace your ISP\'s DNS with a privacy-friendly alternative. Your ISP will no longer see every website you visit.',
      detail: '<p>DNS is like the phone book of the internet. By default, your ISP handles your DNS requests — meaning they can see every site you visit. Private DNS changes that.</p><p><strong>Recommended DNS:</strong> Quad9 (9.9.9.9) — blocks malicious domains, no logging</p><p><strong>How to change:</strong></p><ul><li>Check our <a href="articles.html">guides</a> for device-specific instructions</li><li>Or use DNS-over-HTTPS in your browser settings</li></ul>',
      time: '3 min',
      difficulty: 2,
      impact: 4,
      icon: '🌐',
      prerequisites: ['ublock-origin']
    },
    {
      id: 'app-permissions',
      stage: 2,
      title: 'Review App Permissions',
      desc: 'Check which apps have access to your camera, microphone, location, and contacts. Revoke what they do not need.',
      detail: '<p>Most apps request far more permissions than they actually need. A flashlight app does not need your location and contacts.</p><p><strong>Where to check:</strong></p><ul><li>Android: Settings &gt; Apps &gt; Permission manager</li><li>iOS: Settings &gt; Privacy</li><li>Review each permission type and revoke unnecessary access</li></ul><p>Regularly reviewing app permissions is one of the easiest privacy wins.</p>',
      time: '5 min',
      difficulty: 1,
      impact: 4,
      icon: '📱',
      prerequisites: []
    },
    {
      id: 'email-aliases',
      stage: 2,
      title: 'Use Email Aliases',
      desc: 'Protect your real email address by using aliases. Stop spam and prevent tracking across services.',
      detail: '<p>Email aliases let you create unique email addresses for each service. If one gets compromised, your real address remains safe.</p><p><strong>Tools to use:</strong></p><ul><li><strong>SimpleLogin</strong> — free and open source</li><li><strong>Firefox Relay</strong> — integrated with Firefox</li><li><strong>ProtonMail</strong> — includes alias support</li></ul><p>Start by creating an alias for newsletters and less important services.</p>',
      time: '5 min',
      difficulty: 2,
      impact: 3,
      icon: '📧',
      prerequisites: ['password-manager']
    },
    {
      id: 'https-everywhere',
      stage: 2,
      title: 'Enable HTTPS-Only Mode',
      desc: 'Force your browser to always use encrypted connections. Prevents eavesdropping on public Wi-Fi.',
      detail: '<p>HTTPS encrypts the connection between your browser and websites. Without it, anyone on the same network can see what you are doing.</p><p><strong>How to enable:</strong></p><ul><li>Firefox: Settings &gt; Privacy &amp; Security &gt; Enable HTTPS-Only Mode</li><li>Chrome: Built-in — enabled by default</li><li>Learn more in our <a href="articles.html">DNS and HTTPS guide</a></li></ul>',
      time: '1 min',
      difficulty: 1,
      impact: 3,
      icon: '🔒',
      prerequisites: ['browser-privacy']
    },
    // Stage 3: Take Back Control
    {
      id: 'choose-vpn',
      stage: 3,
      title: 'Choose a Privacy VPN',
      desc: 'Protect your internet traffic from your ISP and public Wi-Fi snooping. Pick a trustworthy, no-logs VPN.',
      detail: '<p>A VPN encrypts all your internet traffic and routes it through a server in a location of your choice. Choose wisely — not all VPNs respect your privacy.</p><p><strong>Recommended VPNs:</strong></p><ul><li><strong>Mullvad VPN</strong> — no email required, fixed price, strong audits</li><li><strong>ProtonVPN</strong> — free tier available, based in Switzerland</li><li><strong>IVPN</strong> — transparent, no logs, open source apps</li></ul><p>Avoid free VPNs — if you are not paying, you are the product.</p>',
      time: '10 min',
      difficulty: 2,
      impact: 4,
      icon: '🔒',
      prerequisites: ['change-search', 'dns-privacy']
    },
    {
      id: 'install-linux',
      stage: 3,
      title: 'Try Linux',
      desc: 'Install Linux alongside your current OS. Discover a world of privacy, freedom, and performance.',
      detail: '<p>Linux is a free, open-source operating system that puts you in control. No telemetry, no ads, no forced updates.</p><p><strong>Start with Ubuntu or Linux Mint</strong> — beginner-friendly, great community support.</p><p><strong>How to try:</strong></p><ul><li>Create a bootable USB</li><li>Try the "Live" mode first (no installation required)</li><li>Install alongside Windows/macOS (dual boot)</li><li>Check our <a href="articles.html">Linux guides</a> for more</li></ul>',
      time: '30 min',
      difficulty: 3,
      impact: 4,
      icon: '🐧',
      prerequisites: []
    },
    {
      id: 'cloud-audit',
      stage: 3,
      title: 'Audit Your Cloud Storage',
      desc: 'Review what you store in the cloud, delete what you do not need, and consider switching to encrypted alternatives.',
      detail: '<p>Cloud storage services like Google Drive and Dropbox scan your files. Switch to end-to-end encrypted alternatives.</p><p><strong>Options:</strong></p><ul><li><strong>Proton Drive</strong> — end-to-end encrypted, zero-knowledge</li><li><strong>Tresorit</strong> — zero-knowledge, EU-based</li><li><strong>Cryptomator</strong> — encrypt files before uploading to any cloud</li></ul><p>Start by deleting old files you no longer need and downloading what matters.</p>',
      time: '15 min',
      difficulty: 2,
      impact: 3,
      icon: '☁️',
      prerequisites: []
    },
    {
      id: 'secure-wifi',
      stage: 3,
      title: 'Secure Your Home Wi-Fi',
      desc: 'Update your router settings to protect your home network from intruders and neighbors.',
      detail: '<p>Your home router is the gateway to all your devices. Securing it takes just a few minutes.</p><p><strong>Steps:</strong></p><ul><li>Change the default admin password</li><li>Enable WPA3 (or WPA2) encryption</li><li>Disable WPS (Wi-Fi Protected Setup)</li><li>Update your router firmware</li><li>Consider a separate guest network for IoT devices</li></ul>',
      time: '10 min',
      difficulty: 2,
      impact: 4,
      icon: '📶',
      prerequisites: []
    },
    {
      id: 'social-privacy',
      stage: 3,
      title: 'Audit Social Media Privacy',
      desc: 'Review your social media privacy settings, limit data sharing, and remove unused accounts.',
      detail: '<p>Social media platforms collect vast amounts of data. Take 15 minutes to lock down your settings.</p><p><strong>Key actions:</strong></p><ul><li>Set profiles to private</li><li>Disable data sharing with third parties</li><li>Turn off location tagging</li><li>Review and remove unused apps connected to your account</li><li>Download your data and delete accounts you no longer use</li></ul>',
      time: '15 min',
      difficulty: 1,
      impact: 3,
      icon: '👤',
      prerequisites: []
    },
    // Stage 4: Advanced
    {
      id: 'self-host',
      stage: 4,
      title: 'Start Self-Hosting',
      desc: 'Take full control of your data by running your own services. Start simple with a Raspberry Pi.',
      detail: '<p>Self-hosting means running your own services on hardware you control. No third party has access to your files, emails, or data.</p><p><strong>Start with:</strong></p><ul><li>A Raspberry Pi 5 or an old laptop</li><li><strong>Nextcloud</strong> for file storage</li><li><strong>Pi-hole</strong> for network-wide ad blocking</li><li><strong>Vaultwarden</strong> for passwords</li></ul><p>Check our <a href="articles/self-hosting-guide.html">Complete Self-Hosting Guide</a> to get started.</p>',
      time: '2 hours',
      difficulty: 4,
      impact: 5,
      icon: '🖥️',
      prerequisites: ['install-linux', 'secure-wifi']
    },
    {
      id: 'grapheneos',
      stage: 4,
      title: 'Switch to GrapheneOS',
      desc: 'The most secure and private mobile OS. Designed for privacy, built on Android, but without Google.',
      detail: '<p>GrapheneOS is a privacy-hardened mobile operating system. It strips out Google services, adds security hardening, and gives you full control.</p><p><strong>Requirements:</strong></p><ul><li>Google Pixel phone (2, 3, 4, 5, 6, 7, 8, or 9 series)</li><li>Web browser on a computer</li><li>About 30 minutes of your time</li></ul><p>Visit <a href="https://grapheneos.org/install/" target="_blank" rel="noopener">grapheneos.org/install</a> for instructions.</p>',
      time: '30 min',
      difficulty: 4,
      impact: 5,
      icon: '📱',
      prerequisites: ['app-permissions']
    },
    {
      id: 'matrix',
      stage: 4,
      title: 'Set Up Matrix',
      desc: 'Decentralized, encrypted communication. Run your own Matrix server for complete control over your messaging.',
      detail: '<p>Matrix is an open, decentralized protocol for secure communication. Unlike Signal which relies on a central server, Matrix lets you run your own server.</p><p><strong>Get started:</strong></p><ul><li>Use a hosted account on <a href="https://element.io" target="_blank" rel="noopener">Element</a></li><li>Or self-host Synapse + Element on your own server</li><li>Bridge to other platforms (Telegram, WhatsApp, Signal) using bridges</li></ul>',
      time: '1 hour',
      difficulty: 4,
      impact: 4,
      icon: '💬',
      prerequisites: ['self-host']
    },
    {
      id: 'hardware-key',
      stage: 4,
      title: 'Use a Hardware Security Key',
      desc: 'The strongest form of two-factor authentication. A physical key that cannot be phished or intercepted.',
      detail: '<p>Hardware security keys (like YubiKey) provide the highest level of account security. They are physical devices that prove your identity.</p><p><strong>Why use one:</strong></p><ul><li>Cannot be phished — no one can trick you into entering a code</li><li>Works across all your devices</li><li>Supports FIDO2/WebAuthn standard</li><li>One key can secure hundreds of accounts</li></ul><p>Recommended: YubiKey 5 Series or Nitrokey.</p>',
      time: '15 min',
      difficulty: 3,
      impact: 5,
      icon: '🔑',
      prerequisites: ['enable-2fa']
    }
  ];

  var STORAGE_KEY = 'ns-journey-progress';

  function getProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveProgress(completed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  }

  function isCompleted(id) {
    return getProgress().indexOf(id) !== -1;
  }

  function toggleMission(id) {
    var completed = getProgress();
    var idx = completed.indexOf(id);
    if (idx === -1) {
      completed.push(id);
    } else {
      completed.splice(idx, 1);
    }
    saveProgress(completed);
    renderAll();
  }

  function renderStars(n) {
    var s = '';
    for (var i = 0; i < 5; i++) {
      s += '<span class="star' + (i < n ? ' filled' : '') + '">&#9733;</span>';
    }
    return s;
  }

  function renderImpact(n) {
    var d = '';
    for (var i = 0; i < 5; i++) {
      d += '<span class="impact-dot' + (i < n ? ' filled' : '') + '"></span>';
    }
    return d;
  }

  function renderMission(m) {
    var done = isCompleted(m.id);
    var detailId = 'ms-detail-' + m.id;
    return '<div class="mission-card' + (done ? ' completed' : '') + '" onclick="window.toggleMissionDetail(\'' + m.id + '\')">' +
      '<h4>' + m.icon + ' ' + Utils.sanitize(m.title) + '</h4>' +
      '<p>' + Utils.sanitize(m.desc) + '</p>' +
      '<div class="mission-meta">' +
        '<span class="tag">&#9200; ' + m.time + '</span>' +
        '<span class="difficulty">' + renderStars(m.difficulty) + '</span>' +
        '<span class="impact">' + renderImpact(m.impact) + '</span>' +
      '</div>' +
      '<div class="mission-detail" id="' + detailId + '">' +
        m.detail +
        '<button class="btn-sm ' + (done ? 'btn-secondary' : 'btn-primary') + '" onclick="event.stopPropagation(); window.completeMission(\'' + m.id + '\')">' +
          (done ? '&#10003; Completed' : 'Mark as complete') +
        '</button>' +
      '</div>' +
    '</div>';
  }

  window.toggleMissionDetail = function (id) {
    var el = document.getElementById('ms-detail-' + id);
    if (el) el.classList.toggle('open');
  };

  window.completeMission = function (id) {
    toggleMission(id);
  };

  function renderAll() {
    var completed = getProgress();
    var total = MISSIONS.length;
    var done = completed.length;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Progress overview
    var progressEl = document.getElementById('progress-overview');
    if (progressEl) {
      progressEl.innerHTML =
        '<div>' +
          '<div class="progress-label">Your progress</div>' +
          '<div class="progress-percent">' + pct + '%</div>' +
          '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="progress-stats">' +
          '<div class="stat"><strong>' + done + '</strong> completed</div>' +
          '<div class="stat"><strong>' + (total - done) + '</strong> remaining</div>' +
          '<div class="stat"><strong>' + total + '</strong> total</div>' +
        '</div>';
    }

    // Render each stage
    for (var stage = 1; stage <= 4; stage++) {
      var grid = document.querySelector('.missions-grid[data-stage="' + stage + '"]');
      if (!grid) continue;
      var stageMissions = MISSIONS.filter(function (m) { return m.stage === stage; });
      grid.innerHTML = stageMissions.map(renderMission).join('');
    }
  }

  function init() {
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
