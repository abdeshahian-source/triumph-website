/* Triumph Ortho & Spine — site JS */
(function () {
  'use strict';

  // Mobile nav toggle
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    // Close on link click (mobile)
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.innerWidth <= 960) {
          nav.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        }
      });
    });
    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        toggle.focus();
      }
    });
  }

  // Set current year in footer
  const yearEl = document.querySelector('[data-current-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Website chat widget -------------------------------------------
     Loaded here so every page that includes main.js gets it. Deliberately
     NOT loaded on /patient-portal/* (those pages don't include main.js) —
     the intake forms collect PHI and shouldn't surface a chat widget.
     Config + system prompt: netlify/functions/chat.js  |  Docs: CHATBOT_SETUP.md */
  (function loadTriumphChat() {
    if (window.__triumphChatLoaded) return;
    var base = document.querySelector('script[src*="js/main.js"]');
    var src = base ? base.getAttribute('src').replace(/main\.js.*$/, 'chat-widget.js')
                   : '/js/chat-widget.js';
    var s = document.createElement('script');
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
  })();
})();
