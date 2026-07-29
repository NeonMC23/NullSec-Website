/**
 * NullSec — Learning Journey V2
 * Interactive mission system with modal detail view,
 * localStorage progress, and mobile-focused missions.
 */

(function () {
  'use strict';

  var MISSIONS = [
    // ========== STAGE 1: Getting Started (8 missions) ==========
    {
      id: 'enable-2fa',
      stage: 1,
      title: 'Enable Two-Factor Authentication',
      desc: 'Add a second layer of security to your most important accounts.',
      time: '15 min',
      difficulty: 1,
      impact: 5,
      icon: '🔐',
      mobileFriendly: true,
      guide: '<p>Two-factor authentication (2FA) adds a second step when you log in. Even if someone steals your password, they cannot access your account without your phone or security key.</p><p><strong>Where to start:</strong></p><ul><li><strong>Google/Gmail:</strong> myaccount.google.com → Security → 2-Step Verification</li><li><strong>Apple ID:</strong> appleid.apple.com → Sign-In & Security</li><li><strong>Microsoft:</strong> account.microsoft.com → Security → Advanced security</li><li><strong>Instagram/Twitch/Discord:</strong> Settings → Security → 2FA</li></ul><p><strong>Which app to use:</strong></p><ul><li><a href="https://ente.io/auth" target="_blank" rel="noopener">Ente Auth</a> — Open source, encrypted backups (recommended)</li><li><a href="https://authy.com" target="_blank" rel="noopener">Authy</a> — Multi-device sync, backups</li><li><a href="https://www.yubico.com" target="_blank" rel="noopener">YubiKey</a> — Hardware key, most secure option</li></ul><p><strong>📱 On mobile:</strong> Download Ente Auth from your app store and set up 2FA for each account one by one. Start with your email — it is the key to everything else.</p>'
    },
    {
      id: 'password-manager',
      stage: 1,
      title: 'Install a Password Manager',
      desc: 'Stop reusing passwords. Generate strong, unique passwords for every account.',
      time: '20 min',
      difficulty: 2,
      impact: 5,
      icon: '🔑',
      mobileFriendly: true,
      guide: '<p>A password manager creates and stores strong passwords so you only need to remember one master password.</p><p><strong>Choose one:</strong></p><ul><li><strong><a href="https://bitwarden.com" target="_blank" rel="noopener">Bitwarden</a></strong> — Free, open source, works on phone + computer + browser</li><li><strong><a href="https://proton.me/pass" target="_blank" rel="noopener">Proton Pass</a></strong> — Encrypted, privacy-focused, free tier</li><li><strong><a href="https://keepassxc.org" target="_blank" rel="noopener">KeePassXC</a></strong> — Offline only, fully local (advanced)</li></ul><p><strong>Setup steps:</strong></p><ul><li>Download Bitwarden on your phone and computer</li><li>Install the browser extension</li><li>Create a strong master password (write it down on paper, keep it safe)</li><li>Start by saving your most important logins (email, bank, social media)</li><li>Use the built-in password generator when creating new accounts</li></ul><p><strong>📱 Mobile:</strong> Bitwarden has excellent iOS and Android apps with autofill support. Enable "Autofill" in your phone settings under Bitwarden.</p>'
    },
    {
      id: 'ublock-origin',
      stage: 1,
      title: 'Install uBlock Origin',
      desc: 'Block ads, trackers, and malware across your browser in 2 minutes.',
      time: '3 min',
      difficulty: 1,
      impact: 5,
      icon: '🛡️',
      mobileFriendly: false,
      guide: '<p>uBlock Origin is the most effective ad blocker available. It blocks ads, trackers, clickbait, and malicious domains while using very little memory.</p><p><strong>Installation:</strong></p><ul><li><strong>Firefox:</strong> <a href="https://addons.mozilla.org/firefox/addon/ublock-origin/" target="_blank" rel="noopener">Install from Firefox Add-ons</a></li><li><strong>Chrome/Edge:</strong> <a href="https://chrome.google.com/webstore/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm" target="_blank" rel="noopener">Install from Chrome Web Store</a></li><li><strong>Brave:</strong> Built-in Shields do the same thing, no install needed</li></ul><p>Once installed, it works automatically. No configuration needed.</p><p><strong>📱 Mobile:</strong> Firefox for Android supports uBlock Origin. Safari on iOS does not support it — use <a href="https://apps.apple.com/app/1blocker/id1365531024" target="_blank" rel="noopener">1Blocker</a> or <a href="https://adguard.com" target="_blank" rel="noopener">AdGuard</a> instead.</p>'
    },
    {
      id: 'check-leaks',
      stage: 1,
      title: 'Check If Your Data Has Leaked',
      desc: 'Find out if your email or passwords have been compromised in data breaches.',
      time: '5 min',
      difficulty: 1,
      impact: 4,
      icon: '🔍',
      mobileFriendly: true,
      guide: '<p>Data breaches happen constantly. Your email address or passwords may already be circulating online.</p><p><strong>Check now:</strong></p><ul><li>Visit <a href="https://haveibeenpwned.com" target="_blank" rel="noopener">haveibeenpwned.com</a></li><li>Enter your email address</li><li>See which breaches you appear in</li></ul><p><strong>What to do if leaked:</strong></p><ul><li>Change that password immediately using your new password manager</li><li>Enable 2FA on that account</li><li>Check other accounts that use the same password</li></ul><p><strong>📱 Mobile:</strong> Works perfectly on phone browser. Bookmark the site for regular checks.</p>'
    },
    {
      id: 'switch-signal',
      stage: 1,
      title: 'Install and Set Up Signal',
      desc: 'Replace WhatsApp or Messenger with truly private, encrypted messaging.',
      time: '15 min',
      difficulty: 1,
      impact: 4,
      icon: '💬',
      mobileFriendly: true,
      guide: '<p>Signal is the gold standard for private messaging. End-to-end encrypted by default, open source, nonprofit, and free.</p><p><strong>Installation:</strong></p><ul><li>Download from <a href="https://signal.org/download/" target="_blank" rel="noopener">signal.org/download/</a></li><li>Available on iOS, Android, Windows, Mac, and Linux</li><li>Register with your phone number</li></ul><p><strong>Getting your contacts to switch:</strong></p><ul><li>Signal has a "Share" feature that sends an invitation via SMS or other apps</li><li>Start with 2-3 close contacts and grow from there</li><li>Enable "Disappearing Messages" for extra privacy</li></ul><p><strong>📱 Mobile-first:</strong> Signal is primarily a mobile app. The desktop app requires the mobile app to work.</p>'
    },
    {
      id: 'browser-privacy',
      stage: 1,
      title: 'Tweak Your Browser Privacy Settings',
      desc: 'Simple settings that make a big difference. No extensions needed.',
      time: '10 min',
      difficulty: 1,
      impact: 3,
      icon: '🌐',
      mobileFriendly: true,
      guide: '<p>Modern browsers have built-in privacy features. Here is how to enable them on each platform.</p><p><strong>Firefox (best for privacy):</strong></p><ul><li>Settings → Privacy & Security → Enhanced Tracking Protection → Strict</li><li>Enable "HTTPS-Only Mode"</li><li>Disable "Allow Firefox to send technical and interaction data"</li><li>Disable "Allow Firefox to install studies"</li></ul><p><strong>Brave (best for ease):</strong></p><ul><li>Brave is private by default. Ensure Shields are enabled (lion icon)</li><li>Set to "Aggressive" blocking for maximum protection</li></ul><p><strong>📱 Mobile:</strong> Firefox Focus on iOS is private by design. Firefox for Android supports the same privacy settings as desktop. Safari users can enable "Prevent Cross-Site Tracking" in Settings → Safari.</p>'
    },
    {
      id: 'phone-lockdown',
      stage: 1,
      title: 'Lock Down Your Phone',
      desc: 'Review what your phone shares by default and take back control.',
      time: '15 min',
      difficulty: 2,
      impact: 4,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>Your phone knows more about you than any other device. Here is how to lock it down.</p><p><strong>iOS:</strong></p><ul><li>Settings → Privacy → Review each permission (Location, Contacts, Microphone, etc.)</li><li>Disable "Significant Locations" under Privacy → Location → System Services</li><li>Settings → Safari → Enable "Prevent Cross-Site Tracking" and "Fraudulent Website Warning"</li><li>Settings → Privacy → Apple Advertising → Disable "Personalized Ads"</li></ul><p><strong>Android:</strong></p><ul><li>Settings → Security & Privacy → Permission manager</li><li>Review all permissions and revoke unnecessary ones</li><li>Settings → Google → Ads → Enable "Opt out of Ads Personalization"</li><li>Disable "Scanning for near-field devices" if you do not use it</li></ul>'
    },
    {
      id: 'app-permissions',
      stage: 1,
      title: 'Review All App Permissions',
      desc: 'Check which apps have access to your camera, mic, location, and contacts.',
      time: '10 min',
      difficulty: 1,
      impact: 4,
      icon: '🔌',
      mobileFriendly: true,
      guide: '<p>Most apps request far more permissions than they actually need. A note-taking app does not need your location or contacts.</p><p><strong>Android:</strong> Settings → Apps → Permission manager → Review each permission type</p><p><strong>iOS:</strong> Settings → Privacy → Review each permission category</p><p><strong>What to look for:</strong></p><ul><li>Camera/Mic access for apps that do not need it (note apps, games)</li><li>Location access set to "Always" instead of "While Using"</li><li>Contacts access for random apps</li><li>Storage/Photos access for apps that do not need files</li></ul><p>Revoke anything suspicious. Apps will request access again if they genuinely need it.</p>'
    },
    // ========== STAGE 2: Build Better Habits (8 missions) ==========
    {
      id: 'change-search',
      stage: 2,
      title: 'Switch to a Private Search Engine',
      desc: 'Get the same search results without being tracked. Takes 2 minutes.',
      time: '5 min',
      difficulty: 1,
      impact: 3,
      icon: '🔎',
      mobileFriendly: true,
      guide: '<p>Search engines track everything you search. DuckDuckGo gives you the same results without the tracking.</p><p><strong>Switch now:</strong></p><ul><li>Visit <a href="https://duckduckgo.com" target="_blank" rel="noopener">duckduckgo.com</a></li><li>Chrome: Settings → Search engine → DuckDuckGo</li><li>Firefox: Settings → Search → Default Search Engine → DuckDuckGo</li><li>Brave: Built-in, already private</li></ul><p><strong>📱 Mobile:</strong> DuckDuckGo has a dedicated mobile browser with built-in tracker blocking. Or change the default search engine in Safari/Chrome settings.</p>'
    },
    {
      id: 'dns-privacy',
      stage: 2,
      title: 'Configure Private DNS on Your Phone',
      desc: 'Stop your ISP from seeing every website you visit. Change your DNS settings.',
      time: '5 min',
      difficulty: 2,
      impact: 4,
      icon: '🌐',
      mobileFriendly: true,
      guide: '<p>DNS is like the phone book of the internet. By default your ISP handles your DNS — meaning they can see every site you visit.</p><p><strong>On Android (Private DNS):</strong></p><ul><li>Settings → Connections → More connection settings → Private DNS</li><li>Select "Private DNS provider hostname"</li><li>Enter: <code>dns.quad9.net</code> or <code>one.one.one.one</code></li><li>Save</li></ul><p><strong>On iOS:</strong></p><ul><li>Settings → Wi-Fi → Tap the (i) next to your network</li><li>Scroll to "Configure DNS" → Manual</li><li>Add: <code>9.9.9.9</code> and <code>1.1.1.1</code></li></ul><p><strong>On desktop:</strong> Check your network settings or use DNS-over-HTTPS in Firefox (Settings → Privacy → DNS over HTTPS).</p>'
    },
    {
      id: 'email-aliases',
      stage: 2,
      title: 'Start Using Email Aliases',
      desc: 'Protect your real email address. Create unique aliases for each service.',
      time: '20 min',
      difficulty: 2,
      impact: 3,
      icon: '📧',
      mobileFriendly: true,
      guide: '<p>Email aliases let you create unique email addresses for each service. If one gets compromised, your real address stays safe.</p><p><strong>Best tools:</strong></p><ul><li><strong><a href="https://simplelogin.io" target="_blank" rel="noopener">SimpleLogin</a></strong> — Free tier (15 aliases), open source, can self-host</li><li><strong><a href="https://relay.firefox.com" target="_blank" rel="noopener">Firefox Relay</a></strong> — Integrated with Firefox, free tier (5 aliases)</li><li><strong>ProtonPass/ProtonMail</strong> — Includes alias support</li></ul><p><strong>How it works:</strong> Create an alias like "newsletter-randomxyz@simplelogin.com". Emails get forwarded to your real inbox. If the alias starts receiving spam, just delete it.</p><p><strong>Start with:</strong> Use aliases for newsletters, shopping sites, and less important accounts. Keep your real email for banking and essential services.</p>'
    },
    {
      id: 'social-audit',
      stage: 2,
      title: 'Audit Your Social Media Privacy',
      desc: 'Review settings, limit data sharing, and remove unused accounts on all your devices.',
      time: '30 min',
      difficulty: 1,
      impact: 3,
      icon: '👤',
      mobileFriendly: true,
      guide: '<p>Social media platforms collect vast amounts of data about you. Take 30 minutes to lock things down.</p><p><strong>Key actions for each platform:</strong></p><ul><li>Set profiles to private</li><li>Disable data sharing with third parties</li><li>Turn off location tagging on posts</li><li>Review connected apps and remove unused ones</li><li>Disable "Allow others to find me by email/phone"</li></ul><p><strong>Extra step:</strong> Go to Settings → Your data → Download your data. Then delete accounts you no longer use at <a href="https://justdelete.me" target="_blank" rel="noopener">justdelete.me</a>.</p><p><strong>📱 Mobile:</strong> Each social app has its own privacy settings in its main menu. Instagram: Settings → Privacy. Twitter: Settings → Privacy and safety.</p>'
    },
    {
      id: 'mobile-browser',
      stage: 2,
      title: 'Install a Privacy Browser on Your Phone',
      desc: 'Replace your default mobile browser with a privacy-first alternative.',
      time: '10 min',
      difficulty: 1,
      impact: 3,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>Your mobile browser tracks your browsing history, searches, and behavior. Switch to a privacy-first alternative.</p><p><strong>iOS options:</strong></p><ul><li><strong>Firefox Focus</strong> — Private by design, blocks trackers, erases history on exit</li><li><strong>Brave</strong> — Built-in ad blocking, private by default</li><li><strong>DuckDuckGo</strong> — Integrated private search + tracker blocking</li></ul><p><strong>Android options:</strong></p><ul><li><strong>Firefox</strong> — Supports uBlock Origin extension, strong privacy settings</li><li><strong>Brave</strong> — Same as desktop, Shields block everything</li><li><strong>Mull</strong> — Hardened Firefox fork, maximum privacy (F-Droid)</li></ul><p>After installing, set it as your default browser in phone settings.</p>'
    },
    {
      id: 'secure-wifi',
      stage: 2,
      title: 'Secure Your Home Wi-Fi',
      desc: 'Update your router to protect all devices on your network.',
      time: '20 min',
      difficulty: 2,
      impact: 4,
      icon: '📶',
      mobileFriendly: false,
      guide: '<p>Your router is the gateway to every device in your home. A few changes can prevent intrusions.</p><p><strong>Steps:</strong></p><ul><li>Log into your router (usually 192.168.1.1 or 192.168.0.1)</li><li>Change the default admin password</li><li>Enable WPA3 encryption (or WPA2 if WPA3 is not available)</li><li>Disable WPS (Wi-Fi Protected Setup — it is insecure)</li><li>Update router firmware (look for "Update" or "Administration")</li><li>Create a separate guest Wi-Fi network for IoT devices (lamps, speakers, cameras)</li><li>Disable remote administration if enabled</li></ul>'
    },
    {
      id: 'phone-backup',
      stage: 2,
      title: 'Encrypt Your Phone Backups',
      desc: 'Ensure your phone backups are encrypted so your data stays safe even if the backup is stolen.',
      time: '10 min',
      difficulty: 2,
      impact: 3,
      icon: '💾',
      mobileFriendly: true,
      guide: '<p>Phone backups contain everything: photos, messages, passwords, and health data. If they are not encrypted, anyone who accesses them can see everything.</p><p><strong>iOS (iCloud Backup):</strong></p><ul><li>Settings → Your Name → iCloud → iCloud Backup → Ensure it is ON</li><li>iCloud backups are encrypted by default</li><li>For extra security: Settings → Your Name → Password & Security → Enable Advanced Data Protection (end-to-end encryption for most data)</li></ul><p><strong>Android (Google Backup):</strong></p><ul><li>Settings → Google → Backup → Ensure backup is ON</li><li>Android backups are encrypted with your account password</li><li>For extra security: Use a strong Google account password with 2FA</li></ul>'
    },
    {
      id: 'cloud-photos',
      stage: 2,
      title: 'Audit Your Cloud Photos',
      desc: 'Review what photos you share with cloud services and consider encrypted alternatives.',
      time: '20 min',
      difficulty: 2,
      impact: 3,
      icon: '📷',
      mobileFriendly: true,
      guide: '<p>Cloud photo services like Google Photos and iCloud scan your images. If privacy matters to you, consider alternatives.</p><p><strong>Options:</strong></p><ul><li><strong><a href="https://ente.io" target="_blank" rel="noopener">Ente</a></strong> — End-to-end encrypted photo backup. Open source, cross-platform</li><li><strong><a href="https://proton.me/drive" target="_blank" rel="noopener">Proton Drive</a></strong> — Zero-knowledge encrypted storage</li><li><strong><a href="https://immich.app" target="_blank" rel="noopener">Immich</a></strong> — Self-hosted photo manager. Full control, but requires a server</li></ul><p><strong>First step:</strong> Download all your photos from Google Photos (Google Takeout) before deleting anything. Start uploading new photos to an encrypted service.</p>'
    },
    // ========== STAGE 3: Take Back Control (7 missions) ==========
    {
      id: 'choose-vpn',
      stage: 3,
      title: 'Choose and Configure a VPN',
      desc: 'Encrypt your internet traffic and hide your IP address from websites and your ISP.',
      time: '30 min',
      difficulty: 2,
      impact: 4,
      icon: '🔒',
      mobileFriendly: true,
      guide: '<p>A VPN encrypts all your internet traffic and routes it through a server of your choice. Choose wisely — not all VPNs respect your privacy.</p><p><strong>Recommended (trustworthy):</strong></p><ul><li><strong><a href="https://mullvad.net" target="_blank" rel="noopener">Mullvad VPN</a></strong> — No email required, fixed 5€/month, independently audited</li><li><strong><a href="https://protonvpn.com" target="_blank" rel="noopener">ProtonVPN</a></strong> — Free tier available, Swiss jurisdiction, no logs</li><li><strong><a href="https://ivpn.net" target="_blank" rel="noopener">IVPN</a></strong> — Transparent, no logs, open source apps</li></ul><p><strong>Avoid:</strong> Free VPNs (they sell your data), VPNs from countries in 5/9/14 Eyes alliance, and VPNs with poor privacy policies.</p><p><strong>📱 Mobile:</strong> Most VPNs have dedicated apps. Mullvad and ProtonVPN work great on iOS and Android. Install and connect with one tap.</p>'
    },
    {
      id: 'selfhost-nextcloud',
      stage: 3,
      title: 'Self-Host Your Own Cloud with Nextcloud',
      desc: 'Set up Nextcloud on an old PC or Raspberry Pi. Your files, your rules, no third party.',
      time: '2 hours',
      difficulty: 4,
      impact: 5,
      icon: '☁️',
      mobileFriendly: false,
      guide: '<p>Nextcloud gives you Google Drive, Calendar, Contacts, and more — all running on hardware you control. No one can access your files except you.</p><p><strong>What you need:</strong></p><ul><li>An old laptop, desktop, or Raspberry Pi 4/5</li><li>Linux installed (Ubuntu Server or Raspberry Pi OS recommended)</li><li>About 2 hours of your time</li></ul><p><strong>Installation:</strong></p><ul><li>Follow the <a href="https://docs.nextcloud.com/server/latest/admin_manual/installation/" target="_blank" rel="noopener">official Nextcloud installation guide</a></li><li>Or use <a href="https://github.com/nextcloud/all-in-one" target="_blank" rel="noopener">Nextcloud All-in-One</a> (Docker-based, easier)</li><li>For remote access: Use Tailscale (free, built on WireGuard) instead of opening ports</li></ul><p>Check our <a href="articles/self-hosting-guide.html">Complete Self-Hosting Guide</a> for detailed steps.</p>'
    },
    {
      id: 'install-linux',
      stage: 3,
      title: 'Install Linux on an Old Computer',
      desc: 'Give an old PC a second life with Linux. Faster, more private, and completely free.',
      time: '1 hour',
      difficulty: 3,
      impact: 4,
      icon: '🐧',
      mobileFriendly: false,
      guide: '<p>Linux can resurrect old computers that struggle with Windows or macOS. No telemetry, no ads, no forced updates.</p><p><strong>For beginners:</strong></p><ul><li><strong><a href="https://ubuntu.com/download/desktop" target="_blank" rel="noopener">Ubuntu</a></strong> — Most beginner-friendly, huge community</li><li><strong><a href="https://linuxmint.com" target="_blank" rel="noopener">Linux Mint</a></strong> — Familiar interface for Windows users</li><li><strong><a href="https://pop.system76.com" target="_blank" rel="noopener">Pop!_OS</a></strong> — Great for developers and gamers</li></ul><p><strong>Installation steps:</strong></p><ul><li>Download the ISO file</li><li>Create a bootable USB using <a href="https://rufus.ie" target="_blank" rel="noopener">Rufus</a> (Windows) or <a href="https://www.balena.io/etcher/" target="_blank" rel="noopener">Balena Etcher</a> (any OS)</li><li>Boot from USB and choose "Try" to test without installing</li><li>When ready, choose "Install" and follow the wizard</li><li>Dual-boot option: Install alongside your existing OS</li></ul>'
    },
    {
      id: 'check-custom-os',
      stage: 3,
      title: 'Check If Your Phone Supports a Custom OS',
      desc: 'Find out if you can install a privacy-focused OS like GrapheneOS on your phone.',
      time: '10 min',
      difficulty: 2,
      impact: 4,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>Some Android phones can run custom operating systems that remove Google services and add privacy hardening.</p><p><strong>Check your device:</strong></p><ul><li><strong><a href="https://grapheneos.org" target="_blank" rel="noopener">GrapheneOS</a></strong> — Requires a Google Pixel (2/3/4/5/6/7/8/9 series). Most secure option.</li><li><strong><a href="https://calyxos.org" target="_blank" rel="noopener">CalyxOS</a></strong> — Supports Pixels and some Xiaomi devices. Easier to install.</li><li><strong><a href="https://lineageos.org" target="_blank" rel="noopener">LineageOS</a></strong> — Wide device support. More customizable but less hardened.</li></ul><p><strong>What you need:</strong></p><ul><li>A computer with a web browser</li><li>Your phone and a USB cable</li><li>About 30 minutes for installation</li></ul><p>If your device is not supported, focus on the app permissions and browser privacy missions instead.</p>'
    },
    {
      id: 'vpn-on-phone',
      stage: 3,
      title: 'Configure a VPN on Your Phone',
      desc: 'Protect your mobile data on public Wi-Fi and cellular networks. Essential for phone privacy.',
      time: '15 min',
      difficulty: 1,
      impact: 4,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>Your phone connects to many networks: home Wi-Fi, public Wi-Fi, cellular data. Without a VPN, anyone on the same network can see your traffic.</p><p><strong>Setup is simple:</strong></p><ul><li>Download Mullvad or ProtonVPN from your app store</li><li>Create an account (Mullvad generates a random account number — no email needed)</li><li>Connect with one tap</li><li>Enable "Auto-connect" on untrusted networks (optional)</li></ul><p><strong>For advanced users:</strong></p><ul><li><a href="https://www.wireguard.com" target="_blank" rel="noopener">WireGuard</a> — Manual setup, more control, better performance</li><li><a href="https://tailscale.com" target="_blank" rel="noopener">Tailscale</a> — Zero-config VPN based on WireGuard, free for personal use</li></ul>'
    },
    {
      id: 'password-health',
      stage: 3,
      title: 'Run a Full Password Health Check',
      desc: 'Audit all your saved passwords, remove weak ones, and enable breach detection.',
      time: '30 min',
      difficulty: 2,
      impact: 5,
      icon: '🔑',
      mobileFriendly: true,
      guide: '<p>Even with a password manager, you may have old weak passwords saved. Run a health check to find and fix them.</p><p><strong>If you use Bitwarden:</strong></p><ul><li>Open the Bitwarden app or browser extension</li><li>Go to Tools → Reports</li><li>Run "Reused Passwords" — aim for zero</li><li>Run "Weak Passwords" — regenerate any weak ones</li><li>Run "Exposed Passwords" — change any that appear in breaches</li></ul><p><strong>Also check:</strong></p><ul><li><a href="https://haveibeenpwned.com" target="_blank" rel="noopener">Have I Been Pwned</a> for your email addresses</li><li>Enable breach alerts in your password manager</li></ul>'
    },
    {
      id: 'adblock-mobile',
      stage: 3,
      title: 'Block Ads and Trackers on Your Phone',
      desc: 'Extend ad blocking to your mobile browser and apps. Faster browsing, less data usage.',
      time: '15 min',
      difficulty: 2,
      impact: 4,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>Ads and trackers on mobile use your data, slow down your browsing, and invade your privacy.</p><p><strong>On Android:</strong></p><ul><li>Use <strong>Firefox</strong> with uBlock Origin (uBlock works on Firefox for Android)</li><li>Or use <strong>Brave</strong> browser with built-in Shield blocking</li><li>For system-wide blocking: Install <a href="https://adguard.com" target="_blank" rel="noopener">AdGuard</a> (requires manual setup)</li></ul><p><strong>On iOS:</strong></p><ul><li>Use <strong>Brave</strong> or <strong>Firefox Focus</strong> with built-in blocking</li><li>Install a content blocker like <a href="https://1blocker.com" target="_blank" rel="noopener">1Blocker</a> from the App Store</li><li>Enable it in Settings → Safari → Content Blockers</li></ul><p><strong>Advanced:</strong> Set up <a href="https://nextdns.io" target="_blank" rel="noopener">NextDNS</a> on your phone for system-wide ad blocking at the DNS level.</p>'
    },
    // ========== STAGE 4: Advanced (6 missions) ==========
    {
      id: 'selfhost-vaultwarden',
      stage: 4,
      title: 'Self-Host Your Passwords with Vaultwarden',
      desc: 'Run your own Bitwarden-compatible server. Full control over your passwords.',
      time: '1 hour',
      difficulty: 4,
      impact: 5,
      icon: '🖥️',
      mobileFriendly: false,
      guide: '<p>Vaultwarden is a lightweight, Bitwarden-compatible server written in Rust. It gives you all the features of Bitwarden Premium for free, running on your own hardware.</p><p><strong>Requirements:</strong></p><ul><li>A Linux server (Raspberry Pi, old PC, or VPS)</li><li>Docker and Docker Compose installed</li><li>A domain name (optional but recommended for HTTPS)</li></ul><p><strong>Quick setup with Docker:</strong></p><ul><li>Create a <code>docker-compose.yml</code> file (check the <a href="https://github.com/dani-garcia/vaultwarden" target="_blank" rel="noopener">Vaultwarden GitHub</a>)</li><li>Run <code>docker-compose up -d</code></li><li>Access your vault at <code>http://your-server:8080</code></li><li>Set up a reverse proxy with Caddy or Nginx for HTTPS</li></ul><p>Once set up, point your Bitwarden apps to your server URL instead of bitwarden.com.</p>'
    },
    {
      id: 'grapheneos',
      stage: 4,
      title: 'Install GrapheneOS on a Pixel Phone',
      desc: 'The most secure mobile OS. Strip out Google, gain real privacy, without losing functionality.',
      time: '1 hour',
      difficulty: 4,
      impact: 5,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>GrapheneOS is a privacy-hardened mobile OS for Google Pixel devices. It removes Google services, adds security hardening, and gives you full control.</p><p><strong>Requirements:</strong></p><ul><li>A Google Pixel phone (2/3/4/5/6/7/8/9 series)</li><li>A computer (Chrome or Chromium browser required)</li><li>USB cable</li><li>About 1 hour</li></ul><p><strong>Installation:</strong></p><ul><li>Visit <a href="https://grapheneos.org/install/" target="_blank" rel="noopener">grapheneos.org/install</a></li><li>The web installer guides you step by step</li><li>No technical knowledge required — the installer handles everything</li></ul><p><strong>After install:</strong> You can install apps from Aurora Store (anonymized Google Play access) or F-Droid (open source only).</p>'
    },
    {
      id: 'matrix-server',
      stage: 4,
      title: 'Self-Host a Matrix Server',
      desc: 'Run your own encrypted, decentralized chat server. Complete control over your conversations.',
      time: '2 hours',
      difficulty: 5,
      impact: 4,
      icon: '💬',
      mobileFriendly: false,
      guide: '<p>Matrix is an open, decentralized protocol for secure communication. Unlike Signal which depends on a central server, Matrix lets you run your own server.</p><p><strong>Setup with Docker:</strong></p><ul><li>Use <a href="https://github.com/spantaleev/matrix-docker-ansible-deploy" target="_blank" rel="noopener">Matrix Docker Ansible Deploy</a></li><li>Or follow the <a href="https://matrix.org/docs/guides/" target="_blank" rel="noopener">official Matrix guides</a></li><li>Need: A Linux server, Docker, and a domain name</li></ul><p><strong>Client:</strong> Use <a href="https://element.io" target="_blank" rel="noopener">Element</a> on phone and desktop to connect to your server.</p><p><strong>Bridges:</strong> You can bridge to WhatsApp, Telegram, Signal, and IRC — all conversations in one place.</p>'
    },
    {
      id: 'hardware-key',
      stage: 4,
      title: 'Set Up a Hardware Security Key',
      desc: 'The strongest form of 2FA. A physical key that cannot be phished or intercepted.',
      time: '20 min',
      difficulty: 3,
      impact: 5,
      icon: '🔑',
      mobileFriendly: true,
      guide: '<p>Hardware security keys (like YubiKey) provide the highest level of account security. They are physical devices that prove your identity using cryptography.</p><p><strong>Why use one:</strong></p><ul><li>Cannot be phished — no code to steal, no SMS to intercept</li><li>Works across all your devices (USB, NFC, Lightning)</li><li>Supports FIDO2/WebAuthn standard</li><li>One key protects hundreds of accounts</li></ul><p><strong>Setup:</strong></p><ul><li>Buy a YubiKey 5 Series or Nitrokey</li><li>Register it with your important accounts (Google, GitHub, Microsoft, Discord)</li><li>Keep a backup key in a safe place</li></ul><p><strong>📱 Mobile:</strong> YubiKeys with NFC work with phones. Tap the key to your phone to log in.</p>'
    },
    {
      id: 'pi-hole',
      stage: 4,
      title: 'Set Up Pi-Hole for Network Ad Blocking',
      desc: 'Block ads on every device in your home at the network level. No more ads on your TV or phone.',
      time: '1 hour',
      difficulty: 3,
      impact: 4,
      icon: '🛡️',
      mobileFriendly: false,
      guide: '<p>Pi-hole blocks ads and trackers at the DNS level for every device on your network — phones, tablets, smart TVs, and computers.</p><p><strong>Requirements:</strong></p><ul><li>A Raspberry Pi or any Linux machine</li><li>Ethernet or Wi-Fi connection</li><li>About 1 hour</li></ul><p><strong>Installation:</strong></p><ul><li>Install Raspberry Pi OS or Ubuntu Server</li><li>Run: <code>curl -sSL https://install.pi-hole.net | bash</code></li><li>Follow the interactive installer</li><li>Change your router\'s DNS to point to your Pi-hole IP</li></ul><p><strong>Result:</strong> 10-20% of your network traffic disappears (ads). Pages load faster. No more YouTube ads on your smart TV.</p>'
    },
    {
      id: 'matrix-phone',
      stage: 4,
      title: 'Use Encrypted Messaging on Your Phone',
      desc: 'Set up Element on your phone for decentralized, encrypted messaging on the go.',
      time: '15 min',
      difficulty: 2,
      impact: 3,
      icon: '📱',
      mobileFriendly: true,
      guide: '<p>Element is the most popular Matrix client. It gives you end-to-end encrypted messaging on your phone without relying on a central server.</p><p><strong>Quick start:</strong></p><ul><li>Download Element from your app store (iOS/Android)</li><li>Create an account on the default Matrix server (matrix.org) or your own</li><li>Enable end-to-end encryption in settings (on by default)</li><li>Start chatting!</li></ul><p><strong>Features:</strong></p><ul><li>End-to-end encrypted voice and video calls</li><li>File sharing with encryption</li><li>Cross-platform — messages sync with desktop</li><li>Open source and audited</li></ul><p>Use Element alongside Signal — Signal for day-to-day, Matrix for communities and advanced users.</p>'
    },
    // ========== COMMUNITY MISSIONS (standalone, linked from homepage) ==========
    {
      id: 'cm-invite-friend',
      stage: 99,
      title: 'Invite Someone to NullSec',
      desc: 'Share NullSec with a friend or family member. Growing the community helps everyone.',
      time: '5 min',
      difficulty: 1,
      impact: 5,
      icon: '🤝',
      mobileFriendly: true,
      guide: '<p>Privacy is better together. The more people who care about digital rights, the stronger our community becomes.</p><p><strong>How to invite:</strong></p><ul><li>Share this link: <a href="https://neonmc23.github.io/NullSec-Website/">neonmc23.github.io/NullSec-Website</a></li><li>Show them the "Learning Journey" — it is designed for beginners</li><li>Help them complete their first mission (e.g., install uBlock Origin together)</li><li>Invite them to Discord: <a href="https://discord.com/invite/uTeCwQQtn">discord.com/invite/uTeCwQQtn</a></li></ul><p><strong>Tip:</strong> Start by talking about a specific tool you use (Signal, Bitwarden) rather than abstract concepts.</p>'
    },
    {
      id: 'cm-talk-family',
      stage: 99,
      title: 'Talk to Your Family About Privacy',
      desc: 'Have a conversation with someone close to you about why privacy matters.',
      time: '15 min',
      difficulty: 2,
      impact: 4,
      icon: '👨‍👩‍👧‍👦',
      mobileFriendly: true,
      guide: '<p>Digital privacy starts at home. Talking to your family helps protect them too.</p><p><strong>Conversation starters:</strong></p><ul><li>"I found this free tool that blocks ads — want me to show you?"</li><li>"Did you know that websites can track everything you do? I can show you how to stop it."</li><li>"I set up this thing called 2FA on my accounts. It only takes a minute and makes them much safer."</li></ul><p><strong>Keep it simple:</strong> Focus on one tool at a time. Start with uBlock Origin or a password manager — things that provide immediate, visible benefits.</p>'
    },
    {
      id: 'cm-fix-typo',
      stage: 99,
      title: 'Report a Bug or Fix a Typo',
      desc: 'Help improve the website. Found a typo, broken link, or confusing text? Report it!',
      time: '5 min',
      difficulty: 1,
      impact: 3,
      icon: '🐛',
      mobileFriendly: true,
      guide: '<p>Every website has mistakes. By reporting them, you help make NullSec better for everyone.</p><p><strong>How to report:</strong></p><ul><li>Join our <a href="https://discord.com/invite/uTeCwQQtn">Discord</a></li><li>Go to the #bug-reports channel</li><li>Describe what you found (include the page URL)</li><li>Or open an issue on <a href="https://github.com/NeonMC23/NullSec-Website">GitHub</a></li></ul><p><strong>Examples of helpful reports:</strong></p><ul><li>"There is a typo on the homepage hero section"</li><li>"The link to Signal on the tools page is broken"</li><li>"The mission description for 2FA is confusing"</li></ul>'
    },
    {
      id: 'cm-review-docs',
      stage: 99,
      title: 'Review a Guide for Accuracy',
      desc: 'Read through a guide and check if everything is correct and understandable.',
      time: '20 min',
      difficulty: 2,
      impact: 4,
      icon: '📖',
      mobileFriendly: true,
      guide: '<p>Documentation is never perfect. By reviewing guides, you help make sure they are accurate and easy to follow.</p><p><strong>How to do it:</strong></p><ul><li>Pick a guide from our <a href="articles.html">Articles</a> page</li><li>Read it thoroughly</li><li>Check if the instructions work (if possible)</li><li>Note anything confusing, missing, or incorrect</li><li>Share your feedback on <a href="https://discord.com/invite/uTeCwQQtn">Discord</a></li></ul><p><strong>Focus on:</strong> Clarity, accuracy, and completeness. Would a beginner understand this?</p>'
    },
    {
      id: 'cm-share-social',
      stage: 99,
      title: 'Share NullSec on Social Media',
      desc: 'Post about NullSec on your social media to spread the word about digital privacy.',
      time: '5 min',
      difficulty: 1,
      impact: 4,
      icon: '📣',
      mobileFriendly: true,
      guide: '<p>Social media is how most people discover new resources. A single post can reach hundreds of people.</p><p><strong>Suggested posts:</strong></p><ul><li>"Just found this awesome free resource for learning about privacy: <a href="https://neonmc23.github.io/NullSec-Website/">neonmc23.github.io/NullSec-Website</a>"</li><li>"Privacy isnt optional. Check out NullSec for practical guides and tools."</li><li>Share a specific guide you found useful (like the VPN comparison or self-hosting guide)</li></ul><p>Tag us on Twitter: @NullSec</p>'
    },
    {
      id: 'cm-help-beginner',
      stage: 99,
      title: 'Help Someone Complete Their First Mission',
      desc: 'Walk a beginner through their first privacy mission. Guide them step by step.',
      time: '30 min',
      difficulty: 2,
      impact: 5,
      icon: '🎓',
      mobileFriendly: true,
      guide: '<p>The best way to learn is to teach. Helping someone else complete their first mission reinforces your own knowledge and grows the community.</p><p><strong>How to help:</strong></p><ul><li>Ask a friend or family member if they want to improve their online privacy</li><li>Walk them through installing uBlock Origin or setting up a password manager</li><li>Answer their questions patiently</li><li>Share our <a href="journey.html">Learning Journey</a> with them</li></ul><p>You can also help on Discord in the #help channel!</p>'
    }
  ];

  var STORAGE_KEY = 'ns-journey-progress';
  var stages = [
    { num: 1, name: 'Getting Started', count: 0 },
    { num: 2, name: 'Build Better Habits', count: 0 },
    { num: 3, name: 'Take Back Control', count: 0 },
    { num: 4, name: 'Advanced', count: 0 }
  ];

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
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
    if (idx === -1) completed.push(id);
    else completed.splice(idx, 1);
    saveProgress(completed);
    renderAll();
  }

  function renderStars(n) {
    var s = '';
    for (var i = 0; i < 5; i++) {
      s += '<span class="star' + (i < n ? ' filled' : '') + '" data-tooltip="' + (i < n ? 'Difficulty level ' + n + '/5' : '') + '">&#9733;</span>';
    }
    return s;
  }

  function renderImpact(n) {
    var d = '';
    for (var i = 0; i < 5; i++) {
      d += '<span class="impact-dot' + (i < n ? ' filled' : '') + '" data-tooltip="' + (i < n ? 'Impact level ' + n + '/5' : '') + '"></span>';
    }
    return d;
  }

  window.openMissionModal = function (id) {
    var mission = MISSIONS.find(function (m) { return m.id === id; });
    if (!mission) return;

    var done = isCompleted(id);
    var stars = renderStars(mission.difficulty);
    var impact = renderImpact(mission.impact);
    var mobileTag = mission.mobileFriendly ? '<span class="tldr-tag">&#128241; Mobile friendly</span>' : '<span class="tldr-tag">&#128187; Desktop</span>';

    Modal.open(
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
        '<span style="font-size:2rem;">' + mission.icon + '</span>' +
        '<div><h2 style="margin:0;">' + Utils.sanitize(mission.title) + '</h2></div>' +
      '</div>' +
      '<div class="modal-sub" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
        '<span class="tldr-tag" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:var(--accent-subtle);color:var(--accent);border-radius:100px;">&#9200; ' + mission.time + '</span>' +
        '<span class="tldr-tag" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(251,191,36,0.12);color:#FBBF24;border-radius:100px;">Difficulty: ' + stars + '</span>' +
        '<span class="tldr-tag" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(255,79,163,0.12);color:var(--accent);border-radius:100px;">Impact: ' + impact + '</span>' +
        mobileTag +
      '</div>' +
      '<div class="modal-body">' + mission.guide + '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn ' + (done ? 'btn-secondary' : 'btn-primary') + '" onclick="window.completeFromModal(\'' + mission.id + '\')">' +
          (done ? '&#10003; Mark incomplete' : 'Mark as complete') +
        '</button>' +
        '<button class="btn btn-secondary" onclick="Modal.close()">Close</button>' +
      '</div>'
    );
  };

  window.completeFromModal = function (id) {
    toggleMission(id);
    Modal.close();
    // Reopen with updated state
    setTimeout(function () { window.openMissionModal(id); }, 100);
  };

  function renderMission(m) {
    var done = isCompleted(m.id);
    var stageStr = m.stage <= 4 ? 'Stage ' + m.stage : 'Community';
    return '<div class="mission-card' + (done ? ' completed' : '') + '" onclick="window.openMissionModal(\'' + m.id + '\')">' +
      '<h4>' + m.icon + ' ' + Utils.sanitize(m.title) + '</h4>' +
      '<p>' + Utils.sanitize(m.desc) + '</p>' +
      '<div class="mission-meta">' +
        '<span class="tag">&#9200; ' + m.time + '</span>' +
        '<span class="difficulty" data-tooltip="Difficulty: ' + m.difficulty + '/5">' + renderStars(m.difficulty) + '</span>' +
        '<span class="impact" data-tooltip="Impact: ' + m.impact + '/5">Impact: ' + renderImpact(m.impact) + '</span>' +
        (m.mobileFriendly ? '<span class="tag">&#128241;</span>' : '<span class="tag">&#128187;</span>') +
      '</div>' +
    '</div>';
  }

  function renderAll() {
    var completed = getProgress();
    var total = MISSIONS.filter(function (m) { return m.stage <= 4; }).length;
    var communityTotal = MISSIONS.filter(function (m) { return m.stage === 99; }).length;
    var done = completed.length;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;

    var progressEl = document.getElementById('progress-overview');
    if (progressEl) {
      progressEl.innerHTML =
        '<div>' +
          '<div class="progress-label">Your progress <span style="font-size:0.75rem;color:var(--text-dim);font-weight:400;">(stored locally, no account needed)</span></div>' +
          '<div class="progress-percent">' + pct + '%</div>' +
          '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="progress-stats">' +
          '<div class="stat"><strong>' + done + '</strong> done</div>' +
          '<div class="stat"><strong>' + (total - (completed.filter(function(id) { return MISSIONS.find(function(m){return m.id===id && m.stage<=4;}); }).length)) + '</strong> left</div>' +
          '<div class="stat"><strong>' + total + '</strong> missions</div>' +
          '<div class="stat"><strong>' + communityTotal + '</strong> community</div>' +
        '</div>';
    }

    stages.forEach(function (stage) {
      var grid = document.querySelector('.missions-grid[data-stage="' + stage.num + '"]');
      if (!grid) return;
      var stageMissions = MISSIONS.filter(function (m) { return m.stage === stage.num; });
      grid.innerHTML = stageMissions.map(renderMission).join('');
    });
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
