/**
 * Triumph Ortho & Spine — intake link sender
 *
 * Staff enter a mobile number (and optionally an email). This function sends a
 * FIXED, generic message pointing at /patient-portal/.
 *
 * PRIVACY DESIGN — do not weaken these without a compliance review:
 *   1. The message body is hard-coded here. The browser CANNOT supply or alter
 *      message text. This endpoint can never be used to send arbitrary content.
 *   2. No patient name, no date of birth, no appointment, no clinical detail
 *      ever leaves this function. Twilio receives a phone number and a generic
 *      marketing-free notice.
 *   3. Nothing is written to persistent storage. Logs record the staff initials
 *      and success/failure only — never the recipient.
 *   4. Patient name is collected in the browser for the on-screen receipt only
 *      and is never transmitted here.
 *
 * Required Netlify environment variables:
 *   STAFF_PASSWORD           shared staff password (defaults to "triumphadmin")
 *   STAFF_CODES              optional: "lauren:4821,anita:9930" for per-person codes
 *
 * SMS (leave SMS_ENABLED unset until A2P/toll-free registration is APPROVED):
 *   SMS_ENABLED              "true" to turn texting on
 *   TWILIO_ACCOUNT_SID       ACxxxxxxxx
 *   TWILIO_AUTH_TOKEN        your auth token
 *   TWILIO_MESSAGING_SERVICE_SID   MGxxxxxxxx   (preferred — A2P attaches here)
 *   TWILIO_FROM              +1XXXXXXXXXX       (fallback if no service SID)
 *
 * Email — preferred path is your own Google Workspace, which is BAA-covered:
 *   LEAD_WEBHOOK_URL         Apps Script web app URL (already set for the chat widget)
 *   INTAKE_LINK_SECRET       must match INTAKE_LINK_SECRET in apps-script/Code.gs
 * Fallback only if the webhook is not configured:
 *   RESEND_API_KEY
 *   LEAD_FROM                "Triumph Ortho & Spine <noreply@triumphorthospine.com>"
 */

'use strict';

const PORTAL_URL = 'https://triumphorthospine.com/patient-portal/';
const PRACTICE_PHONE = '(877) 215-7246';

/* The only message this endpoint will ever send. Fixed server-side. */
const SMS_BODY =
  'Triumph Ortho & Spine: your new patient forms are ready. ' +
  'Complete them here: ' + PORTAL_URL + ' ' +
  'Questions? Call ' + PRACTICE_PHONE + ' or use the chat on our website. ' +
  'Reply STOP to opt out.';

const EMAIL_SUBJECT = 'Your new patient forms — Triumph Ortho & Spine';

const EMAIL_HTML = `
<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#0d2340;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 20px;font:700 18px/1.3 Georgia,serif;color:#071B3A;letter-spacing:.04em">TRIUMPH ORTHO &amp; SPINE</p>
  <p style="margin:0 0 16px">Your new patient forms are ready.</p>
  <p style="margin:0 0 24px">
    <a href="${PORTAL_URL}" style="display:inline-block;background:#C9A24A;color:#071B3A;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:8px">Complete your forms</a>
  </p>
  <p style="margin:0 0 16px;font-size:14px;color:#3d4d6b">
    The forms take about ten minutes and fill out on your phone. Everything you type stays
    in your browser until you finish and send it to us.
  </p>
  <p style="margin:0 0 16px;font-size:14px;color:#3d4d6b">
    Questions? Call ${PRACTICE_PHONE} or use the chat button on our website.
  </p>
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6e0d4;font-size:12px;color:#6B7484">
    Please do not reply to this email with medical information. If this is an emergency, call 911.
  </p>
</div>`;

/* ------------------------------------------------------------------ */

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

/** Timing-safe-ish string compare. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Shared staff password. Set STAFF_PASSWORD in Netlify to override the default.
 *
 * STAFF_CODES is optional and takes precedence when set. Use it later if you
 * want per-person passwords and a record of who sent what:
 *   STAFF_CODES="lauren:4821,anita:9930,ehsan:1177"
 */
const DEFAULT_PASSWORD = 'triumphadmin';

function staffForCode(code) {
  const entered = String(code || '').trim();
  if (!entered) return null;

  const raw = (process.env.STAFF_CODES || '').trim();
  if (raw) {
    for (const pair of raw.split(',')) {
      const idx = pair.indexOf(':');
      if (idx < 1) continue;
      const label = pair.slice(0, idx).trim();
      const secret = pair.slice(idx + 1).trim();
      if (secret && safeEqual(secret, entered)) return label;
    }
    return null;
  }

  const shared = (process.env.STAFF_PASSWORD || DEFAULT_PASSWORD).trim();
  return safeEqual(shared, entered) ? 'staff' : null;
}

/** US 10-digit -> E.164. Returns null if it doesn't look like a real US mobile. */
function toE164(input) {
  const digits = String(input || '').replace(/\D/g, '');
  let ten;
  if (digits.length === 10) ten = digits;
  else if (digits.length === 11 && digits[0] === '1') ten = digits.slice(1);
  else return null;
  // Area code and exchange cannot start with 0 or 1.
  if (/^[01]/.test(ten) || /^[01]/.test(ten.slice(3))) return null;
  return '+1' + ten;
}

function looksLikeEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
}

/* Failed-password throttle. Five bad guesses inside a minute and this instance
   stops answering. Combined with the 1.2s delay below it makes brute-forcing a
   short shared password impractical at the rate an attacker would need. */
const failures = [];
function noteFailure() { failures.push(Date.now()); }
function lockedOut() {
  const now = Date.now();
  while (failures.length && now - failures[0] > 60_000) failures.shift();
  return failures.length >= 5;
}

/* Best-effort throttle. Serverless instances are short-lived and not shared,
   so this stops a runaway loop, not a determined attacker. The passcode is the
   real gate. */
const hits = [];
function throttled() {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 20) return true;
  hits.push(now);
  return false;
}

/* ------------------------------------------------------------------ */

async function sendSms(to) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || (!service && !from)) {
    return { ok: false, reason: 'Twilio is not configured yet.' };
  }

  const params = new URLSearchParams({ To: to, Body: SMS_BODY });
  if (service) params.set('MessagingServiceSid', service);
  else params.set('From', from);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = data.code;
    let reason = data.message || `Twilio error ${res.status}`;
    if (code === 30034 || code === 21704 || code === 30032) {
      reason = 'Carrier registration (A2P/toll-free) is not approved yet, so this text was blocked. Send the email instead.';
    } else if (code === 21211 || code === 21614) {
      reason = 'That number is not a valid mobile number.';
    } else if (code === 21610) {
      reason = 'This number replied STOP and has opted out. Use email instead.';
    } else if (code === 21608) {
      reason = 'Twilio is still in trial mode — the number must be verified in the Twilio console first.';
    }
    return { ok: false, reason, code };
  }

  return { ok: true, status: data.status };
}

async function sendEmail(to) {
  // Preferred: Google Apps Script running inside the Triumph Workspace. The
  // message body lives there, so this call carries only a recipient address.
  if (process.env.LEAD_WEBHOOK_URL && process.env.INTAKE_LINK_SECRET) {
    const res = await fetch(process.env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      // text/plain avoids an Apps Script CORS preflight.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'intakeLink',
        secret: process.env.INTAKE_LINK_SECRET,
        to,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, reason: data.error === 'Unauthorized'
        ? 'The email script rejected the shared secret. INTAKE_LINK_SECRET does not match Code.gs.'
        : (data.error || `Email script returned ${res.status}.`) };
    }
    return { ok: true };
  }

  // Fallback: Resend.
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, reason: 'Email is not configured yet. Set LEAD_WEBHOOK_URL and INTAKE_LINK_SECRET.' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.LEAD_FROM || 'Triumph Ortho & Spine <onboarding@resend.dev>',
      to: [to],
      subject: EMAIL_SUBJECT,
      html: EMAIL_HTML,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, reason: `Email provider rejected the send (${res.status}). ${t.slice(0, 120)}` };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };

  // Status probe for the staff page. Reveals nothing sensitive.
  if (event.httpMethod === 'GET') {
    return json(200, {
      smsEnabled: String(process.env.SMS_ENABLED).toLowerCase() === 'true'
        && !!process.env.TWILIO_ACCOUNT_SID,
      emailEnabled: (!!process.env.LEAD_WEBHOOK_URL && !!process.env.INTAKE_LINK_SECRET)
        || !!process.env.RESEND_API_KEY,
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  // Same-origin only. Blocks a form on someone else's site posting here.
  const origin = event.headers.origin || event.headers.referer || '';
  if (origin && !/^https?:\/\/([a-z0-9-]+\.)*triumphorthospine\.com/i.test(origin)
             && !/^https?:\/\/localhost/i.test(origin)
             && !/\.netlify\.app/i.test(origin)) {
    return json(403, { error: 'Forbidden' });
  }

  if (throttled()) return json(429, { error: 'Too many sends in a row. Wait a minute and try again.' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Bad request' });
  }

  if (lockedOut()) {
    return json(429, { error: 'Too many failed password attempts. Wait a minute and try again.' });
  }

  const staff = staffForCode(body.passcode);
  if (!staff) {
    noteFailure();
    // Slow down guessing. The password is shared and short, so this matters.
    await new Promise((r) => setTimeout(r, 1200));
    console.log('[intake-link] rejected: bad password');
    return json(401, { error: 'That password is not recognized.' });
  }

  const wantsSms = !!body.phone;
  const wantsEmail = !!body.email;
  if (!wantsSms && !wantsEmail) {
    return json(400, { error: 'Enter a mobile number, an email address, or both.' });
  }

  const results = { sms: null, email: null };

  if (wantsSms) {
    const to = toE164(body.phone);
    if (!to) {
      results.sms = { ok: false, reason: 'That does not look like a valid 10-digit US number.' };
    } else if (String(process.env.SMS_ENABLED).toLowerCase() !== 'true') {
      results.sms = { ok: false, reason: 'Texting is turned off until carrier registration is approved. Nothing was sent by text.' };
    } else {
      try {
        results.sms = await sendSms(to);
      } catch (err) {
        results.sms = { ok: false, reason: 'Could not reach the texting provider.' };
        console.error('[intake-link] sms transport error', err.message);
      }
    }
  }

  if (wantsEmail) {
    const to = String(body.email).trim();
    if (!looksLikeEmail(to)) {
      results.email = { ok: false, reason: 'That does not look like a valid email address.' };
    } else {
      try {
        results.email = await sendEmail(to);
      } catch (err) {
        results.email = { ok: false, reason: 'Could not reach the email provider.' };
        console.error('[intake-link] email transport error', err.message);
      }
    }
  }

  // Deliberately no recipient data in the log.
  console.log('[intake-link] staff=%s sms=%s email=%s',
    staff,
    results.sms ? (results.sms.ok ? 'sent' : 'failed') : 'skipped',
    results.email ? (results.email.ok ? 'sent' : 'failed') : 'skipped');

  const anyOk = (results.sms && results.sms.ok) || (results.email && results.email.ok);
  return json(anyOk ? 200 : 502, { staff, results });
};
