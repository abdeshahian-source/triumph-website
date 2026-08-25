/**
 * Triumph Ortho & Spine — website chat widget
 * Self-contained: injects its own styles, no dependencies, no external calls
 * except to our own /.netlify/functions/chat endpoint.
 */
(function () {
  'use strict';

  if (window.__triumphChatLoaded) return;
  window.__triumphChatLoaded = true;

  var ENDPOINT = '/.netlify/functions/chat';
  var STORAGE_KEY = 'triumph_chat_v1';
  var GREETING =
    "Hi — welcome to Triumph Ortho & Spine. I can help with appointments, locations, insurance questions, or what to expect at a visit.\n\nWhat's going on?";
  var QUICK = [
    'I need an appointment',
    'I was in an accident',
    'Do you take my insurance?',
    'Where are you located?',
  ];

  var messages = [];
  var busy = false;
  var opened = false;

  /* ---------------------------------------------------------------- styles */
  var css = `
.tos-chat *,.tos-chat *::before,.tos-chat *::after{box-sizing:border-box}
.tos-launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:10px;
  padding:14px 20px 14px 16px;border:0;border-radius:999px;cursor:pointer;
  background:#0d2340;color:#fbf7ee;box-shadow:0 8px 28px rgba(13,35,64,.28);
  font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;letter-spacing:.01em;
  transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
.tos-launcher:hover{transform:translateY(-2px);box-shadow:0 12px 34px rgba(13,35,64,.34);background:#14213d}
.tos-launcher:focus-visible{outline:3px solid #b58540;outline-offset:3px}
.tos-launcher svg{flex:0 0 auto}
.tos-launcher.tos-hide{opacity:0;pointer-events:none;transform:scale(.9)}
.tos-dot{position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background:#b58540;border:2px solid #fbf7ee}

.tos-panel{position:fixed;right:20px;bottom:20px;z-index:2147483001;width:400px;max-width:calc(100vw - 32px);
  height:620px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;
  background:#fbf7ee;border-radius:18px;border:1px solid rgba(20,33,61,.10);
  box-shadow:0 28px 70px rgba(13,35,64,.30);
  opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;
  transition:opacity .2s ease,transform .2s ease}
.tos-panel.tos-open{opacity:1;transform:none;pointer-events:auto}

.tos-head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:16px 16px 16px 20px;background:#0d2340;color:#f5efe1}
.tos-mark{width:38px;height:38px;flex:0 0 auto;border-radius:9px;background:#14213d;border:1px solid rgba(181,133,64,.5);
  display:flex;align-items:center;justify-content:center;color:#c99a52;
  font:700 20px/1 Cinzel,'Times New Roman',serif}
.tos-head-txt{flex:1 1 auto;min-width:0}
.tos-title{font:600 15px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;letter-spacing:.02em}
.tos-sub{margin-top:2px;font:400 12px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  color:rgba(245,239,225,.72);display:flex;align-items:center;gap:6px}
.tos-live{width:7px;height:7px;border-radius:50%;background:#5ac47d;flex:0 0 auto}
.tos-x,.tos-reset{flex:0 0 auto;width:34px;height:34px;border:0;border-radius:8px;background:transparent;color:#f5efe1;
  cursor:pointer;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s}
.tos-x:hover,.tos-reset:hover{background:rgba(245,239,225,.14)}
.tos-x:focus-visible,.tos-reset:focus-visible{outline:2px solid #b58540;outline-offset:2px}
.tos-reset[hidden]{display:none}

.tos-log{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:20px 18px 8px;
  display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth}
.tos-log::-webkit-scrollbar{width:8px}
.tos-log::-webkit-scrollbar-thumb{background:rgba(20,33,61,.16);border-radius:4px}

.tos-msg{max-width:86%;padding:12px 15px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;
  font:400 14.5px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  animation:tos-in .22s ease both}
@keyframes tos-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.tos-bot{align-self:flex-start;background:#fff;color:#14213d;border:1px solid rgba(20,33,61,.09);
  border-bottom-left-radius:5px;box-shadow:0 2px 8px rgba(20,33,61,.05)}
.tos-me{align-self:flex-end;background:#0d2340;color:#f5efe1;border-bottom-right-radius:5px}
.tos-msg a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.tos-bot a{color:#8a6528}

.tos-typing{align-self:flex-start;display:flex;gap:5px;padding:15px;background:#fff;border-radius:14px;
  border:1px solid rgba(20,33,61,.09);border-bottom-left-radius:5px}
.tos-typing i{width:7px;height:7px;border-radius:50%;background:#8892a8;animation:tos-b 1.3s infinite}
.tos-typing i:nth-child(2){animation-delay:.18s}.tos-typing i:nth-child(3){animation-delay:.36s}
@keyframes tos-b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}

.tos-quick{display:flex;flex-wrap:wrap;gap:8px;padding:4px 18px 12px}
.tos-chip{padding:9px 14px;border:1px solid rgba(181,133,64,.55);border-radius:999px;background:rgba(181,133,64,.07);
  color:#7a5a22;cursor:pointer;font:500 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  transition:background .15s,transform .15s}
.tos-chip:hover{background:rgba(181,133,64,.16);transform:translateY(-1px)}
.tos-chip:focus-visible{outline:2px solid #b58540;outline-offset:2px}

.tos-foot{flex:0 0 auto;border-top:1px solid rgba(20,33,61,.09);background:#fbf7ee;padding:12px 14px 10px}
.tos-row{display:flex;align-items:flex-end;gap:9px;background:#fff;border:1px solid rgba(20,33,61,.14);
  border-radius:13px;padding:7px 7px 7px 14px;transition:border-color .15s,box-shadow .15s}
.tos-row:focus-within{border-color:#b58540;box-shadow:0 0 0 3px rgba(181,133,64,.13)}
.tos-in{flex:1 1 auto;border:0;outline:0;resize:none;max-height:110px;background:transparent;color:#14213d;
  font:400 14.5px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;padding:6px 0}
.tos-in::placeholder{color:#8892a8}
.tos-send{flex:0 0 auto;width:37px;height:37px;border:0;border-radius:10px;background:#0d2340;color:#fbf7ee;
  cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s}
.tos-send:hover:not(:disabled){background:#b58540}
.tos-send:disabled{opacity:.35;cursor:default}
.tos-send:focus-visible{outline:2px solid #b58540;outline-offset:2px}
.tos-legal{margin:9px 2px 0;text-align:center;color:#8892a8;
  font:400 11px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
.tos-legal a{color:#8a6528}

@media (max-width:520px){
  .tos-panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border:0}
  .tos-launcher{right:14px;bottom:14px;padding:13px 18px 13px 15px}
}
@media (prefers-reduced-motion:reduce){
  .tos-panel,.tos-launcher,.tos-msg{transition:none;animation:none}
}`;

  /* ------------------------------------------------------------------ dom */
  var root = document.createElement('div');
  root.className = 'tos-chat';
  root.innerHTML =
    '<style>' + css + '</style>' +
    '<button class="tos-launcher" type="button" aria-label="Open chat with Triumph Ortho and Spine">' +
      '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span>Questions? We\'re here.</span><span class="tos-dot"></span>' +
    '</button>' +
    '<section class="tos-panel" role="dialog" aria-modal="false" aria-label="Chat with Triumph Ortho and Spine" hidden>' +
      '<header class="tos-head">' +
        '<div class="tos-mark" aria-hidden="true">T</div>' +
        '<div class="tos-head-txt">' +
          '<div class="tos-title">Triumph Ortho &amp; Spine</div>' +
          '<div class="tos-sub"><span class="tos-live"></span>Virtual care coordinator</div>' +
        '</div>' +
        '<button class="tos-reset" type="button" aria-label="Start a new conversation" title="Start over" hidden>' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<button class="tos-x" type="button" aria-label="Close chat">&times;</button>' +
      '</header>' +
      '<div class="tos-log" role="log" aria-live="polite" aria-atomic="false"></div>' +
      '<div class="tos-quick"></div>' +
      '<footer class="tos-foot">' +
        '<div class="tos-row">' +
          '<textarea class="tos-in" rows="1" placeholder="Type your message…" aria-label="Type your message"></textarea>' +
          '<button class="tos-send" type="button" aria-label="Send message" disabled>' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
            '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</div>' +
        '<p class="tos-legal">Please don\'t share medical details here. For emergencies call 911 &middot; ' +
        '<a href="tel:18772157246">1-877-215-PAIN</a></p>' +
      '</footer>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.tos-launcher');
  var panel = root.querySelector('.tos-panel');
  var closeBtn = root.querySelector('.tos-x');
  var log = root.querySelector('.tos-log');
  var quick = root.querySelector('.tos-quick');
  var input = root.querySelector('.tos-in');
  var send = root.querySelector('.tos-send');
  var resetBtn = root.querySelector('.tos-reset');

  /* -------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function linkify(s) {
    return esc(s)
      .replace(/\b(1-877-215-PAIN|1-877-215-7246|877-215-7246)\b/g, '<a href="tel:18772157246">$1</a>')
      .replace(/\b(?:https?:\/\/)?(triumphorthospine\.com(?:\/[\w\-\/]*)?)/g, '<a href="https://$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\b911\b/g, '<strong>911</strong>');
  }

  function bubble(role, text) {
    var el = document.createElement('div');
    el.className = 'tos-msg ' + (role === 'user' ? 'tos-me' : 'tos-bot');
    el.innerHTML = linkify(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function typing(on) {
    var ex = log.querySelector('.tos-typing');
    if (on && !ex) {
      var t = document.createElement('div');
      t.className = 'tos-typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      log.appendChild(t);
      log.scrollTop = log.scrollHeight;
    } else if (!on && ex) {
      ex.remove();
    }
  }

  function renderQuick(show) {
    quick.innerHTML = '';
    if (!show) return;
    QUICK.forEach(function (q) {
      var b = document.createElement('button');
      b.className = 'tos-chip';
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', function () {
        renderQuick(false);
        submit(q);
      });
      quick.appendChild(b);
    });
  }

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!Array.isArray(saved) || !saved.length) return false;
      messages = saved;
      saved.forEach(function (m) { bubble(m.role, m.content); });
      return true;
    } catch (e) { return false; }
  }

  /* --------------------------------------------------------------- send */
  function submit(text) {
    text = (text || input.value).trim();
    if (!text || busy) return;

    input.value = '';
    input.style.height = 'auto';
    send.disabled = true;
    renderQuick(false);

    bubble('user', text);
    messages.push({ role: 'user', content: text });
    save();
    syncReset();

    busy = true;
    typing(true);

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, page: location.pathname }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing(false);
        var reply =
          (data && data.reply) ||
          "I'm having trouble connecting. Please call 1-877-215-PAIN and our team will help you right away.";
        bubble('assistant', reply);
        messages.push({ role: 'assistant', content: reply });
        save();
      })
      .catch(function () {
        typing(false);
        bubble(
          'assistant',
          "I'm having trouble connecting. Please call 1-877-215-PAIN and our team will help you right away."
        );
      })
      .finally(function () {
        busy = false;
        input.focus();
      });
  }

  /* -------------------------------------------------------------- events */
  function open() {
    panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add('tos-open'); });
    launcher.classList.add('tos-hide');
    launcher.setAttribute('aria-expanded', 'true');

    if (!opened) {
      opened = true;
      if (!restore()) {
        bubble('assistant', GREETING);
        messages.push({ role: 'assistant', content: GREETING });
        renderQuick(true);
        save();
      }
      syncReset();
    }
    setTimeout(function () { input.focus(); }, 220);
  }

  function close() {
    panel.classList.remove('tos-open');
    launcher.classList.remove('tos-hide');
    launcher.setAttribute('aria-expanded', 'false');
    setTimeout(function () { if (!panel.classList.contains('tos-open')) panel.hidden = true; }, 220);
    launcher.focus();
  }

  /* Show "start over" only once the visitor has actually said something. */
  function syncReset() {
    resetBtn.hidden = !messages.some(function (m) { return m.role === 'user'; });
  }

  /* Wipe the transcript and start a fresh conversation. */
  function reset() {
    if (busy) return;
    messages = [];
    log.innerHTML = '';
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    input.value = '';
    input.style.height = 'auto';
    send.disabled = true;
    bubble('assistant', GREETING);
    messages.push({ role: 'assistant', content: GREETING });
    renderQuick(true);
    save();
    syncReset();
    input.focus();
  }

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', reset);
  send.addEventListener('click', function () { submit(); });

  input.addEventListener('input', function () {
    send.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('tos-open')) close();
  });

  /* Deep link: any element with data-triumph-chat opens the widget */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-triumph-chat]');
    if (t) { e.preventDefault(); open(); }
  });
})();
