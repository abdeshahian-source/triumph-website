/* ============================================================
   TRIUMPH PATIENT PORTAL — intake.js
   Client-side-only intake with conditional branching, image
   embedding, canvas signature, and PDF generation via jsPDF.
   No PHI is transmitted from this page.
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  // Google Apps Script Web App URL that receives intake PDFs and emails
  // them to info@triumphorthospine.com. Runs inside Triumph's Google
  // Workspace (BAA-covered). See apps-script/Code.gs.
  // Leave empty ("") to disable auto-send and use manual email only.
  const APPS_SCRIPT_URL = "";

  // ============================================================
  // STATE
  // ============================================================
  const LS_KEY = 'triumph_intake_v1';
  const state = {
    currentStep: 1,
    totalSteps: 6,
    data: {},
    uploads: {},          // key -> { dataUrl, name, size, type }
    signature: null,      // dataURL of signature canvas
    reasonType: null,
    paymentType: null,
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ============================================================
  // INIT
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    $('#year').textContent = new Date().getFullYear();
    // Default today's date on signature
    const today = new Date().toISOString().slice(0, 10);
    $('#signDate').value = today;

    loadProgress();
    hydrateFromState();
    bindEvents();
    updateConditionals();
    updateProgress();
    initSignature();
  });

  // ============================================================
  // EVENT BINDING
  // ============================================================
  function bindEvents() {
    // Step navigation buttons
    $$('[data-action="next"]').forEach(btn => btn.addEventListener('click', goNext));
    $$('[data-action="back"]').forEach(btn => btn.addEventListener('click', goBack));

    // Radio + checkbox changes → update conditionals + save
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('input, select, textarea')) {
        captureField(t);
        updateConditionals();
        saveProgress();
      }
    });

    // Text input changes (debounced auto-save)
    let saveTimer;
    document.addEventListener('input', (e) => {
      if (e.target.matches('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], textarea')) {
        captureField(e.target);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveProgress(true), 800);
      }
    });

    // File uploads
    $$('[data-upload-input]').forEach(input => {
      input.addEventListener('change', (e) => handleUpload(e.target));
    });
    $$('[data-upload-remove]').forEach(btn => {
      btn.addEventListener('click', () => removeUpload(btn.dataset.uploadRemove));
    });

    // Drag & drop for upload zones
    $$('[data-upload]').forEach(zone => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const key = zone.dataset.upload;
        const input = $(`[data-upload-input="${key}"]`);
        // Assign via DataTransfer so change event fires
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleUpload(input);
      });
    });

    // Pain scale buttons
    const scale = $('#painScale');
    if (scale) {
      scale.addEventListener('click', (e) => {
        const btn = e.target.closest('.pain-scale__btn');
        if (!btn) return;
        $$('.pain-scale__btn', scale).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.dataset.pain;
        $('#painScore').value = val;
        state.data.painScore = val;
        saveProgress();
      });
    }

    // Signature pad clear
    const clearBtn = $('#sigClear');
    if (clearBtn) clearBtn.addEventListener('click', clearSignature);

    // PDF download
    $('#downloadPdf').addEventListener('click', generatePdf);

    // Start over
    $('#startOver').addEventListener('click', () => {
      if (confirm('This will erase your responses and start a new form. Continue?')) {
        localStorage.removeItem(LS_KEY);
        location.reload();
      }
    });

    // Warn on unload
    window.addEventListener('beforeunload', (e) => {
      if (state.currentStep < 6 && Object.keys(state.data).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ============================================================
  // FIELD CAPTURE
  // ============================================================
  function captureField(el) {
    const name = el.name;
    if (!name) return;

    if (el.type === 'checkbox') {
      // Multi-checkbox groups: collect all with same name
      const group = $$(`input[name="${name}"]:checked`);
      if (group.length > 1 || $$(`input[name="${name}"]`).length > 1) {
        state.data[name] = group.map(x => x.value);
      } else {
        state.data[name] = el.checked;
      }
    } else if (el.type === 'radio') {
      if (el.checked) {
        state.data[name] = el.value;
        if (name === 'reasonType') state.reasonType = el.value;
        if (name === 'paymentType') state.paymentType = el.value;
      }
    } else {
      state.data[name] = el.value;
    }

    // Sync signName default from first/last if empty
    if ((name === 'firstName' || name === 'lastName') && !state.data.signName) {
      const full = [state.data.firstName, state.data.lastName].filter(Boolean).join(' ');
      if (full) $('#signName').value = full;
    }
  }

  function hydrateFromState() {
    // Rebuild UI from state.data on load
    Object.entries(state.data).forEach(([name, val]) => {
      const els = $$(`[name="${name}"]`);
      els.forEach(el => {
        if (el.type === 'checkbox') {
          if (Array.isArray(val)) el.checked = val.includes(el.value);
          else el.checked = !!val;
        } else if (el.type === 'radio') {
          el.checked = (el.value === val);
        } else {
          el.value = val;
        }
      });
    });

    state.reasonType = state.data.reasonType || null;
    state.paymentType = state.data.paymentType || null;

    // Restore pain scale
    if (state.data.painScore != null) {
      const b = $(`.pain-scale__btn[data-pain="${state.data.painScore}"]`);
      if (b) b.classList.add('active');
    }

    // Restore upload previews
    Object.entries(state.uploads).forEach(([key, meta]) => renderUpload(key, meta));

    // Restore signature preview (drawn later in initSignature)
  }

  // ============================================================
  // CONDITIONAL VISIBILITY
  // ============================================================
  function updateConditionals() {
    $$('[data-show-when]').forEach(el => {
      const [field, valList] = el.dataset.showWhen.split(':');
      const wanted = valList.split(',');
      const actual = state.data[field];
      const match = Array.isArray(actual)
        ? actual.some(v => wanted.includes(v))
        : wanted.includes(actual);
      el.classList.toggle('show', !!match);
    });

    // Special: GFE notice on step 1
    const gfeNotice = $('#gfeNotice');
    if (gfeNotice) gfeNotice.classList.toggle('show', state.paymentType === 'selfpay');
  }

  // ============================================================
  // NAVIGATION (with skip logic)
  // ============================================================
  function shouldSkip(stepNum) {
    const panel = $(`.step-panel[data-step="${stepNum}"]`);
    if (!panel) return false;
    const skipRule = panel.dataset.skipWhen;
    if (!skipRule) return false;
    const [field, valList] = skipRule.split(':');
    const wanted = valList.split(',');
    return wanted.includes(state.data[field]);
  }

  function goNext() {
    if (!validateStep(state.currentStep)) return;

    let next = state.currentStep + 1;
    while (next <= state.totalSteps && shouldSkip(next)) next++;
    if (next > state.totalSteps) return;

    // Populate review if landing on step 6
    if (next === 6) renderReview();

    showStep(next);
  }

  function goBack() {
    let prev = state.currentStep - 1;
    while (prev >= 1 && shouldSkip(prev)) prev--;
    if (prev < 1) return;
    showStep(prev);
  }

  function showStep(num) {
    $$('.step-panel').forEach(p => p.classList.remove('active'));
    const panel = $(`.step-panel[data-step="${num}"]`);
    if (!panel) return;
    panel.classList.add('active');
    state.currentStep = num;
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Signature canvas requires a proper size AFTER its step is visible.
    // On DOMContentLoaded the canvas is display:none → rect.width = 0 → canvas dead.
    // Re-init the moment step 5 becomes active.
    if (num === 5 && sigCanvas) {
      requestAnimationFrame(() => {
        const savedDataUrl = state.signature;
        resizeSigCanvas();
        sigCtx = sigCanvas.getContext('2d');
        sigCtx.strokeStyle = '#0a0e1a';
        sigCtx.lineWidth = 2;
        sigCtx.lineJoin = 'round';
        sigCtx.lineCap = 'round';
        if (savedDataUrl) {
          const img = new Image();
          img.onload = () => {
            sigCtx.drawImage(img, 0, 0, sigCanvas.width, sigCanvas.height);
            sigDirty = true;
            $('#sigPlaceholder').classList.add('hidden');
          };
          img.src = savedDataUrl;
        } else {
          $('#sigPlaceholder').classList.remove('hidden');
        }
      });
    }
  }

  function updateProgress() {
    const active = $(`.step-panel[data-step="${state.currentStep}"]`);
    const name = active ? active.dataset.name : '';
    $('#stepCurrent').textContent = state.currentStep;
    $('#stepName').textContent = name;

    // Count visible (non-skipped) steps for accurate percentage
    let visibleSteps = 0;
    let completedVisible = 0;
    for (let i = 1; i <= state.totalSteps; i++) {
      if (!shouldSkip(i)) {
        visibleSteps++;
        if (i <= state.currentStep) completedVisible++;
      }
    }
    const pct = (completedVisible / visibleSteps) * 100;
    $('#progressFill').style.width = pct + '%';
    $('#stepTotal').textContent = visibleSteps;
  }

  // ============================================================
  // VALIDATION
  // ============================================================
  function validateStep(num) {
    const panel = $(`.step-panel[data-step="${num}"]`);
    if (!panel) return true;
    let ok = true;
    let firstBad = null;

    // Required inputs
    $$('[required]', panel).forEach(el => {
      // Skip if inside a hidden conditional
      const cond = el.closest('.conditional');
      if (cond && !cond.classList.contains('show')) return;
      const field = el.closest('.field');
      const empty = !el.value.trim();
      if (empty) {
        ok = false;
        if (field) field.classList.add('has-error');
        if (!firstBad) firstBad = el;
      } else if (field) field.classList.remove('has-error');
    });

    // data-required checkboxes (single required)
    $$('input[type="checkbox"][data-required]', panel).forEach(el => {
      const cond = el.closest('.conditional');
      if (cond && !cond.classList.contains('show')) return;
      if (!el.checked) {
        ok = false;
        const choice = el.closest('.choice');
        if (choice) choice.style.borderColor = 'var(--danger)';
        if (!firstBad) firstBad = el;
      } else {
        const choice = el.closest('.choice');
        if (choice) choice.style.borderColor = '';
      }
    });

    // data-required-when (context-dependent)
    $$('input[data-required-when]', panel).forEach(el => {
      const [field, valList] = el.dataset.requiredWhen.split(':');
      const wanted = valList.split(',');
      if (!wanted.includes(state.data[field])) return;
      const cond = el.closest('.conditional');
      if (cond && !cond.classList.contains('show')) return;
      if (el.type === 'checkbox' && !el.checked) {
        ok = false;
        const choice = el.closest('.choice');
        if (choice) choice.style.borderColor = 'var(--danger)';
        if (!firstBad) firstBad = el;
      }
    });

    // Big-choice radio groups (data-required on wrapper)
    $$('[data-required]', panel).forEach(wrap => {
      const name = wrap.dataset.required;
      const anyChecked = $$(`input[name="${name}"]:checked`, wrap).length > 0;
      if (!anyChecked && $$(`input[name="${name}"]`, wrap).length > 0) {
        ok = false;
        wrap.style.outline = '2px solid var(--danger)';
        wrap.style.outlineOffset = '4px';
        wrap.style.borderRadius = 'var(--radius-md)';
        if (!firstBad) firstBad = wrap;
        // Clear outline on any change
        const clearOnChange = () => {
          wrap.style.outline = '';
          wrap.removeEventListener('change', clearOnChange);
        };
        wrap.addEventListener('change', clearOnChange);
      }
    });

    // Step 4: pain score required
    if (num === 4) {
      if (!state.data.painScore) {
        ok = false;
        const scale = $('#painScale');
        if (scale) scale.style.outline = '2px solid var(--danger)';
        if (!firstBad) firstBad = scale;
        const clearOnClick = () => {
          scale.style.outline = '';
          scale.removeEventListener('click', clearOnClick);
        };
        if (scale) scale.addEventListener('click', clearOnClick);
      }
    }

    // Step 5: signature required
    if (num === 5) {
      if (!hasSignature()) {
        ok = false;
        const wrap = $('.sig-wrapper');
        if (wrap) wrap.style.borderColor = 'var(--danger)';
        if (!firstBad) firstBad = wrap;
      } else {
        const wrap = $('.sig-wrapper');
        if (wrap) wrap.style.borderColor = '';
      }
    }

    if (!ok && firstBad) {
      const rect = firstBad.getBoundingClientRect ? firstBad.getBoundingClientRect() : null;
      if (rect) {
        window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: 'smooth' });
      }
    }
    return ok;
  }

  // ============================================================
  // FILE UPLOAD → base64 data URL (never transmitted)
  // ============================================================
  function handleUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const key = input.dataset.uploadInput;

    // 10 MB cap
    if (file.size > 10 * 1024 * 1024) {
      alert('File is larger than 10 MB. Please choose a smaller file.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const meta = {
        dataUrl: e.target.result,
        name: file.name,
        size: file.size,
        type: file.type,
      };
      state.uploads[key] = meta;
      renderUpload(key, meta);
      saveProgress();
    };
    reader.readAsDataURL(file);
  }

  function renderUpload(key, meta) {
    const preview = $(`[data-upload-preview="${key}"]`);
    const thumb = $(`[data-upload-thumb="${key}"]`);
    const nameEl = $(`[data-upload-name="${key}"]`);
    const sizeEl = $(`[data-upload-size="${key}"]`);
    if (!preview) return;
    if (meta.type && meta.type.startsWith('image/')) {
      thumb.src = meta.dataUrl;
      thumb.style.display = 'block';
    } else {
      thumb.style.display = 'none';
    }
    nameEl.textContent = meta.name;
    sizeEl.textContent = formatBytes(meta.size);
    preview.classList.add('has-file');
  }

  function removeUpload(key) {
    delete state.uploads[key];
    const preview = $(`[data-upload-preview="${key}"]`);
    if (preview) preview.classList.remove('has-file');
    const input = $(`[data-upload-input="${key}"]`);
    if (input) input.value = '';
    saveProgress();
  }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ============================================================
  // SIGNATURE PAD (canvas-based, touch + mouse)
  // ============================================================
  let sigCtx, sigCanvas, sigDrawing = false, sigLastX = 0, sigLastY = 0, sigDirty = false;

  function initSignature() {
    sigCanvas = $('#sigCanvas');
    if (!sigCanvas) return;
    resizeSigCanvas();
    sigCtx = sigCanvas.getContext('2d');
    sigCtx.strokeStyle = '#0a0e1a';
    sigCtx.lineWidth = 2;
    sigCtx.lineJoin = 'round';
    sigCtx.lineCap = 'round';

    const getXY = (e) => {
      const rect = sigCanvas.getBoundingClientRect();
      const pt = e.touches ? e.touches[0] : e;
      return {
        x: (pt.clientX - rect.left) * (sigCanvas.width / rect.width),
        y: (pt.clientY - rect.top) * (sigCanvas.height / rect.height),
      };
    };

    const start = (e) => {
      e.preventDefault();
      sigDrawing = true;
      const p = getXY(e);
      sigLastX = p.x;
      sigLastY = p.y;
      $('#sigPlaceholder').classList.add('hidden');
    };

    const move = (e) => {
      if (!sigDrawing) return;
      e.preventDefault();
      const p = getXY(e);
      sigCtx.beginPath();
      sigCtx.moveTo(sigLastX, sigLastY);
      sigCtx.lineTo(p.x, p.y);
      sigCtx.stroke();
      sigLastX = p.x;
      sigLastY = p.y;
      sigDirty = true;
    };

    const end = () => {
      if (sigDirty) {
        sigDrawing = false;
        state.signature = sigCanvas.toDataURL('image/png');
        saveProgress();
      }
      sigDrawing = false;
    };

    sigCanvas.addEventListener('mousedown', start);
    sigCanvas.addEventListener('mousemove', move);
    sigCanvas.addEventListener('mouseup', end);
    sigCanvas.addEventListener('mouseleave', end);
    sigCanvas.addEventListener('touchstart', start, { passive: false });
    sigCanvas.addEventListener('touchmove', move, { passive: false });
    sigCanvas.addEventListener('touchend', end);

    // Restore prior signature if any
    if (state.signature) {
      const img = new Image();
      img.onload = () => {
        sigCtx.drawImage(img, 0, 0, sigCanvas.width, sigCanvas.height);
        sigDirty = true;
        $('#sigPlaceholder').classList.add('hidden');
      };
      img.src = state.signature;
    }

    window.addEventListener('resize', () => {
      const dataUrl = state.signature;
      resizeSigCanvas();
      sigCtx = sigCanvas.getContext('2d');
      sigCtx.strokeStyle = '#0a0e1a';
      sigCtx.lineWidth = 2;
      sigCtx.lineJoin = 'round';
      sigCtx.lineCap = 'round';
      if (dataUrl) {
        const img = new Image();
        img.onload = () => sigCtx.drawImage(img, 0, 0, sigCanvas.width, sigCanvas.height);
        img.src = dataUrl;
      }
    });
  }

  function resizeSigCanvas() {
    const rect = sigCanvas.getBoundingClientRect();
    sigCanvas.width = rect.width * 2;   // 2x for HiDPI
    sigCanvas.height = 180 * 2;
  }

  function clearSignature() {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    sigDirty = false;
    state.signature = null;
    $('#sigPlaceholder').classList.remove('hidden');
    saveProgress();
  }

  function hasSignature() {
    return sigDirty || !!state.signature;
  }

  // ============================================================
  // PERSISTENCE (localStorage — patient's device only)
  // ============================================================
  function saveProgress(showIndicator) {
    try {
      const payload = {
        data: state.data,
        uploads: state.uploads,
        signature: state.signature,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      if (showIndicator) flashSaveIndicator();
    } catch (err) {
      // Quota exceeded (large images can hit this). Save without uploads as fallback.
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          data: state.data,
          signature: state.signature,
          savedAt: new Date().toISOString(),
          uploadsSkipped: true,
        }));
      } catch (e) { /* silent */ }
    }
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload.data) state.data = payload.data;
      if (payload.uploads) state.uploads = payload.uploads;
      if (payload.signature) state.signature = payload.signature;
    } catch (e) { /* silent */ }
  }

  let indicatorTimer;
  function flashSaveIndicator() {
    const el = $('#saveIndicator');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }

  // ============================================================
  // REVIEW RENDER
  // ============================================================
  function renderReview() {
    const container = $('#reviewContent');
    if (!container) return;

    const d = state.data;
    const sections = [];

    const fullName = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || '—';
    const preferred = d.preferredName ? ` ("${d.preferredName}")` : '';

    sections.push(buildReviewSection('Getting Started', [
      ['Reason for visit', prettyReason(d.reasonType)],
      ['Payment', d.paymentType === 'insurance' ? 'Insurance' : d.paymentType === 'selfpay' ? 'Self-pay' : '—'],
    ]));

    sections.push(buildReviewSection('About You', [
      ['Name', fullName + preferred],
      ['Date of birth', d.dob || '—'],
      ['Sex at birth', d.sexAtBirth || '—'],
      ['Gender identity', d.genderIdentity || '—'],
      ['Marital status', d.maritalStatus || '—'],
      ['Address', formatAddress(d)],
      ['Mobile phone', d.phone || '—'],
      ['Alternate phone', d.phoneAlt || '—'],
      ['Email', d.email || '—'],
      ['Preferred contact', d.preferredContact || '—'],
      ['Emergency contact', [d.ecName, d.ecRelation, d.ecPhone].filter(Boolean).join(' · ') || '—'],
      ['Photo ID', state.uploads.photoId ? state.uploads.photoId.name : '(none uploaded)'],
    ]));

    // Insurance section — only if not skipped
    if (!shouldSkip(3)) {
      if (d.paymentType === 'insurance') {
        sections.push(buildReviewSection('Insurance', [
          ['Carrier', d.ins1Carrier || '—'],
          ['Plan', d.ins1PlanName || '—'],
          ['Member ID', d.ins1Member || '—'],
          ['Group #', d.ins1Group || '—'],
          ['Subscriber', d.ins1Subscriber || '(self)'],
          ['Relationship', d.ins1SubscriberRel || '—'],
          ['Secondary carrier', d.ins2Carrier || '—'],
          ['Secondary member ID', d.ins2Member || '—'],
          ['Card — front', state.uploads.insFront ? state.uploads.insFront.name : '(not uploaded)'],
          ['Card — back', state.uploads.insBack ? state.uploads.insBack.name : '(not uploaded)'],
        ]));
      } else if (d.paymentType === 'selfpay') {
        sections.push(buildReviewSection('Billing', [
          ['Payment', 'Self-pay'],
          ['Acknowledgment', d.selfpayAck ? 'Acknowledged' : 'Not acknowledged'],
        ]));
      }
    }

    sections.push(buildReviewSection('Medical History', [
      ['Chief complaint', d.chiefComplaint || '—'],
      ['Pain locations', asList(d.painLoc)],
      ['Pain score', d.painScore != null ? `${d.painScore} / 10` : '—'],
      ['Onset', d.painOnset || '—'],
      ['Cause', d.painCause || '—'],
      ['Makes it worse', d.painWorse || '—'],
      ['Makes it better', d.painBetter || '—'],
      ['Prior treatments', asList(d.priorTx)],
      ['Current medications', d.medications || '—'],
      ['Allergies', d.allergies || '—'],
      ['Past medical history', asList(d.pmh)],
      ['Other conditions', d.pmhOther || '—'],
      ['Past surgeries', d.surgicalHistory || '—'],
      ['Tobacco', d.tobacco || '—'],
      ['Alcohol', d.alcohol || '—'],
      ['Recreational drugs', d.recreational || '—'],
      ['Occupation', d.occupation || '—'],
      ['Exercise', d.exercise || '—'],
      ['Family history', asList(d.famhx)],
    ]));

    const consents = [
      ['HIPAA Notice acknowledged', d.hipaaAck ? 'Yes' : 'No'],
      ['Consent to treatment', d.tosConsent ? 'Yes' : 'No'],
      ['Financial responsibility', d.financialAck ? 'Yes' : 'No'],
      ['Contact consent', d.commsConsent ? 'Yes' : 'No'],
    ];
    if (d.paymentType === 'selfpay') consents.push(['Good Faith Estimate acknowledged', d.gfeAck ? 'Yes' : 'No']);
    if (d.reasonType === 'auto' || d.reasonType === 'work') consents.push(['Third-party billing authorized', d.thirdPartyAck ? 'Yes' : 'No']);
    consents.push(['Signature', hasSignature() ? '✓ Captured' : '(missing)']);
    consents.push(['Signed name', d.signName || '—']);
    consents.push(['Date signed', d.signDate || '—']);
    sections.push(buildReviewSection('Consents & Signature', consents));

    container.innerHTML = sections.join('');
  }

  function buildReviewSection(title, rows) {
    const lis = rows.map(([label, value]) => {
      const empty = !value || value === '—' || value === '(not uploaded)' || value === '(none uploaded)';
      const cls = empty ? 'review-list__value review-list__value--empty' : 'review-list__value';
      return `<li>
        <span class="review-list__label">${escapeHtml(label)}</span>
        <span class="${cls}">${escapeHtml(value)}</span>
      </li>`;
    }).join('');
    return `<div class="review-section"><h4>${escapeHtml(title)}</h4><ul class="review-list">${lis}</ul></div>`;
  }

  function asList(v) {
    if (!v || (Array.isArray(v) && !v.length)) return '(none)';
    return Array.isArray(v) ? v.join(', ') : v;
  }

  function prettyReason(r) {
    return { general: 'General / Chronic', auto: 'Auto Accident', work: 'Work Injury', sports: 'Sports / Activity' }[r] || '—';
  }

  function formatAddress(d) {
    const line1 = [d.address1, d.address2].filter(Boolean).join(', ');
    const line2 = [d.city, d.state, d.zip].filter(Boolean).join(', ').replace(/, (\d)/, ' $1');
    return [line1, line2].filter(Boolean).join(' · ') || '—';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ============================================================
  // PDF GENERATION
  // ============================================================
  function generatePdf() {
    try {
      _generatePdf();
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('There was an issue generating your PDF: ' + err.message + '\n\nIf you drew a signature, try clearing it and signing again, then click Download.');
    }
  }

  // Basic sanity check: does this data URL look like a real image?
  function isValidImageDataUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('data:image/')) return false;
    // A blank/corrupt canvas often produces a very short data URL
    if (url.length < 200) return false;
    return true;
  }

  function _generatePdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const d = state.data;

    // Palette
    const GOLD = [201, 162, 74];
    const NAVY = [7, 27, 58];
    const TEXT = [40, 40, 40];
    const MUTED = [110, 110, 110];

    let y = 40;
    const M = 40;
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Header block on page 1
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 88, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 88, W, 4, 'F');

    doc.setTextColor(...GOLD);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('TRIUMPH ORTHO & SPINE', M, 44);

    doc.setTextColor(220, 220, 220);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('NEW PATIENT INTAKE FORM', M, 62);

    const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    doc.text(`Completed: ${timestamp}`, M, 78);

    // Patient name banner
    y = 116;
    doc.setTextColor(...NAVY);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const patientName = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || '(no name provided)';
    doc.text(patientName, M, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`DOB: ${d.dob || '—'}  ·  Phone: ${d.phone || '—'}  ·  ${d.email || '—'}`, M, y);
    y += 22;

    // Helpers ------------------------------------------------
    const ensureSpace = (needed) => {
      if (y + needed > H - 60) { doc.addPage(); y = 50; drawPageHeader(); }
    };
    const drawPageHeader = () => {
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'normal');
      doc.text('Triumph Ortho & Spine — Patient Intake (continued)', M, 32);
      doc.text(patientName, W - M, 32, { align: 'right' });
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.6);
      doc.line(M, 38, W - M, 38);
    };
    const sectionHeader = (label) => {
      ensureSpace(40);
      doc.setFillColor(...NAVY);
      doc.rect(M, y, W - 2 * M, 22, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(M, y + 22, 60, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(label.toUpperCase(), M + 10, y + 15);
      y += 34;
    };
    const kv = (label, value) => {
      const v = (value == null || value === '' || (Array.isArray(value) && !value.length)) ? '—' : value;
      const vStr = Array.isArray(v) ? v.join(', ') : String(v);
      const wrapped = doc.splitTextToSize(vStr, W - 2 * M - 160);
      const needed = 14 + (wrapped.length - 1) * 12;
      ensureSpace(needed + 4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...TEXT);
      doc.text(wrapped, M + 150, y);
      y += needed + 4;
    };
    const spacer = (px) => { y += px || 8; };
    const divider = () => {
      ensureSpace(10);
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.4);
      doc.line(M, y, W - M, y);
      y += 10;
    };

    // ===== SECTION: Getting Started =====
    sectionHeader('Visit Reason & Payment');
    kv('Reason for visit', prettyReason(d.reasonType));
    kv('Payment method', d.paymentType === 'insurance' ? 'Insurance' : d.paymentType === 'selfpay' ? 'Self-pay' : '—');
    spacer();

    // ===== SECTION: Demographics =====
    sectionHeader('Patient Information');
    kv('Legal name', patientName);
    if (d.preferredName) kv('Preferred name', d.preferredName);
    if (d.pronouns) kv('Pronouns', d.pronouns);
    kv('Date of birth', d.dob);
    kv('Sex at birth', d.sexAtBirth);
    if (d.genderIdentity) kv('Gender identity', d.genderIdentity);
    kv('Marital status', d.maritalStatus);
    kv('Preferred language', d.preferredLanguage);
    divider();
    kv('Address', formatAddress(d));
    kv('Mobile phone', d.phone);
    if (d.phoneAlt) kv('Alternate phone', d.phoneAlt);
    kv('Email', d.email);
    kv('Preferred contact', d.preferredContact);
    divider();
    kv('Emergency contact', [d.ecName, d.ecRelation, d.ecPhone].filter(Boolean).join(' · '));
    spacer();

    // Photo ID image
    if (state.uploads.photoId && isValidImageDataUrl(state.uploads.photoId.dataUrl)) {
      sectionHeader('Photo ID');
      const photoH = addImage(doc, state.uploads.photoId.dataUrl, M, y, 280);
      y += photoH + 18;
    } else if (state.uploads.photoId) {
      kv('Photo ID', state.uploads.photoId.name + ' (non-image, view separately)');
    }

    // ===== SECTION: Insurance (only if not skipped) =====
    if (!shouldSkip(3)) {
      if (d.paymentType === 'insurance') {
        sectionHeader('Insurance');
        kv('Carrier', d.ins1Carrier);
        kv('Plan name', d.ins1PlanName);
        kv('Member ID', d.ins1Member);
        kv('Group #', d.ins1Group);
        kv('Subscriber name', d.ins1Subscriber || '(self)');
        kv('Relationship', d.ins1SubscriberRel);
        if (d.ins2Carrier) {
          divider();
          kv('Secondary carrier', d.ins2Carrier);
          kv('Secondary member ID', d.ins2Member);
        }
        spacer();

        if (state.uploads.insFront && isValidImageDataUrl(state.uploads.insFront.dataUrl)) {
          sectionHeader('Insurance Card — Front');
          const h1 = addImage(doc, state.uploads.insFront.dataUrl, M, y, 380);
          y += h1 + 18;
        }
        if (state.uploads.insBack && isValidImageDataUrl(state.uploads.insBack.dataUrl)) {
          sectionHeader('Insurance Card — Back');
          const h2 = addImage(doc, state.uploads.insBack.dataUrl, M, y, 380);
          y += h2 + 18;
        }
      } else if (d.paymentType === 'selfpay') {
        sectionHeader('Billing — Self Pay');
        kv('Payment', 'Self-pay');
        kv('Acknowledged', d.selfpayAck ? 'Yes' : 'No');
        spacer();
      }
    } else {
      sectionHeader('Insurance & Billing');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      const skipMsg = `— OMITTED — This visit is a ${d.reasonType === 'auto' ? 'motor-vehicle-accident' : 'workers\' compensation'} claim. Billing will be routed through the ${d.reasonType === 'auto' ? 'PIP / no-fault carrier' : 'workers\' compensation carrier'}.`;
      const lines = doc.splitTextToSize(skipMsg, W - 2 * M);
      ensureSpace(lines.length * 12 + 10);
      doc.text(lines, M, y);
      y += lines.length * 12 + 12;
    }

    // ===== SECTION: Medical History =====
    sectionHeader('Chief Complaint');
    const cc = doc.splitTextToSize(d.chiefComplaint || '—', W - 2 * M);
    ensureSpace(cc.length * 12 + 6);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT);
    doc.text(cc, M, y);
    y += cc.length * 12 + 12;

    sectionHeader('Pain Assessment');
    kv('Locations', asList(d.painLoc));
    kv('Severity (0-10)', d.painScore != null ? `${d.painScore} / 10` : '—');
    kv('Onset', d.painOnset);
    kv('Cause', d.painCause);
    kv('Makes it worse', d.painWorse);
    kv('Makes it better', d.painBetter);
    kv('Prior treatments', asList(d.priorTx));
    spacer();

    sectionHeader('Medications & Allergies');
    kv('Current medications', d.medications);
    kv('Allergies', d.allergies);
    spacer();

    sectionHeader('Past Medical & Surgical History');
    kv('Medical history', asList(d.pmh));
    if (d.pmhOther) kv('Other conditions', d.pmhOther);
    kv('Past surgeries', d.surgicalHistory);
    spacer();

    sectionHeader('Social & Family History');
    kv('Tobacco', d.tobacco);
    kv('Alcohol', d.alcohol);
    kv('Recreational drugs', d.recreational);
    kv('Occupation', d.occupation);
    kv('Exercise', d.exercise);
    kv('Family history', asList(d.famhx));
    spacer();

    // ===== SECTION: Consents =====
    sectionHeader('Consents & Attestations');
    kv('HIPAA Notice acknowledged', d.hipaaAck ? '✓ Yes' : '✗ No');
    kv('Consent to treatment', d.tosConsent ? '✓ Yes' : '✗ No');
    kv('Financial responsibility', d.financialAck ? '✓ Yes' : '✗ No');
    kv('Communications consent', d.commsConsent ? '✓ Yes' : '✗ No');
    if (d.paymentType === 'selfpay') kv('Good Faith Estimate', d.gfeAck ? '✓ Yes' : '✗ No');
    if (d.reasonType === 'auto' || d.reasonType === 'work') kv('Third-party billing', d.thirdPartyAck ? '✓ Yes' : '✗ No');
    spacer();

    // Signature block
    ensureSpace(140);
    sectionHeader('Patient Signature');
    if (isValidImageDataUrl(state.signature)) {
      doc.addImage(state.signature, 'PNG', M, y, 220, 70);
    } else {
      doc.setDrawColor(180, 180, 180);
      doc.rect(M, y, 220, 70);
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text('(no signature captured)', M + 10, y + 40);
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(M, y + 82, M + 220, y + 82);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('Patient signature', M, y + 94);
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(d.signName || '', M, y + 108);
    doc.setDrawColor(0, 0, 0);
    doc.line(M + 260, y + 82, M + 480, y + 82);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Date', M + 260, y + 94);
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(d.signDate || '', M + 260, y + 108);
    y += 130;

    // Footer on every page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Triumph Ortho & Spine  ·  info@triumphorthospine.com  ·  1-877-215-PAIN (7246)  ·  Fax (877) 706-1872',
        W / 2, H - 22, { align: 'center' }
      );
      doc.text(`Page ${i} of ${pageCount}`, W - M, H - 22, { align: 'right' });
    }

    // Filename
    const safe = (s) => (s || 'patient').replace(/[^\w\-]/g, '_');
    const fname = `Triumph_Intake_${safe(d.lastName)}_${safe(d.firstName)}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);

    // Show email helper (manual fallback ALWAYS available)
    $('#postDownload').style.display = 'block';
    const subject = encodeURIComponent(`New Patient Intake — ${patientName}`);
    const body = encodeURIComponent(
      `Hello Triumph team,\n\nPlease find attached my completed new-patient intake form.\n\nName: ${patientName}\nDOB: ${d.dob || ''}\nPhone: ${d.phone || ''}\n\nThank you.`
    );
    $('#emailLink').href = `mailto:info@triumphorthospine.com?subject=${subject}&body=${body}`;

    // Auto-send to Triumph via Apps Script webhook (if configured)
    if (APPS_SCRIPT_URL) {
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      autoSend({
        patientName: patientName,
        patientDob:  d.dob || '',
        patientPhone: d.phone || '',
        patientEmail: d.email || '',
        filename: fname,
        pdfBase64: pdfBase64,
      });
    }
  }

  // ============================================================
  // AUTO-SEND TO TRIUMPH (Google Apps Script webhook)
  // ============================================================
  function autoSend(payload) {
    const statusEl = $('#autoSendStatus');
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.className = 'autosend autosend--sending';
    statusEl.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" class="autosend__spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>' +
      '<span>Sending your intake to Triumph&hellip;</span>';

    // Use text/plain to avoid CORS preflight; Apps Script parses JSON server-side
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json().catch(() => ({ ok: false, error: 'Bad response' })))
      .then(data => {
        if (data && data.ok) {
          statusEl.className = 'autosend autosend--ok';
          statusEl.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>' +
            '<div><strong>Sent to Triumph.</strong> Your PDF is on its way to <em>info@triumphorthospine.com</em>. The download above is your copy.</div>';
        } else {
          throw new Error(data && data.error ? data.error : 'Send failed');
        }
      })
      .catch(err => {
        console.warn('Auto-send failed:', err);
        statusEl.className = 'autosend autosend--fail';
        statusEl.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '<div><strong>Auto-send didn\'t go through.</strong> No worries — please tap <em>Open email to send</em> below and attach the PDF that just downloaded.</div>';
      });
  }

  // Fit-to-width image helper. Returns the height actually placed on the PDF.
  function addImage(doc, dataUrl, x, y, targetW) {
    try {
      const props = doc.getImageProperties(dataUrl);
      const ratio = props.height / props.width;
      const h = targetW * ratio;
      const fmt = (props.fileType || 'JPEG').toUpperCase();
      doc.addImage(dataUrl, fmt, x, y, targetW, h);
      return h;
    } catch (e) {
      console.warn('Skipped image (bad data):', e.message);
      return 0;
    }
  }

})();
