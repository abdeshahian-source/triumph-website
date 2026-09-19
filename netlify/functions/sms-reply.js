/**
 * Inbound SMS auto-responder for the Triumph patient intake number.
 *
 * Why this exists: patients reply to texts. Without this, a reply to
 * +1 (609) 256-6143 hits nothing at all and the patient gets silence from a
 * number they reasonably believe reaches the practice. This closes that loop
 * with one fixed sentence pointing them at a monitored channel.
 *
 * Deliberate properties:
 *   - The reply text is a constant. Nothing from the inbound message is echoed
 *     back, so no patient-supplied content can be reflected into a reply.
 *   - Nothing is logged. Inbound bodies may contain PHI; this function never
 *     writes the body, the sender number, or any part of either anywhere.
 *   - STOP / HELP and their variants are left alone. Twilio's own opt-out
 *     handling answers those; replying again would double-text the patient and
 *     muddy the compliance record.
 *   - Requests are rejected unless they carry a valid Twilio signature.
 */

const crypto = require('crypto');

const REPLY =
  'Triumph Ortho & Spine: this number is not monitored and we cannot reply here. ' +
  'For help with your forms or any question, call (877) 215-7246 or chat at ' +
  'triumphorthospine.com. If this is an emergency, call 911.';

// Twilio answers these itself when Advanced Opt-Out is on. Stay silent.
const CARRIER_KEYWORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit',
  'help', 'info',
  'start', 'yes', 'unstop',
]);

function xml(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
  };
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

/**
 * Twilio signs each webhook: HMAC-SHA1 over the full request URL with every
 * POST parameter appended in sorted key order, keyed by the auth token.
 */
function signatureIsValid(event, params) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const supplied = event.headers['x-twilio-signature'];
  if (!token || !supplied) return false;

  const url = event.rawUrl || `https://${event.headers.host}${event.path}`;
  const payload = Object.keys(params).sort().reduce(
    (acc, key) => acc + key + params[key], url);

  const expected = crypto.createHmac('sha1', token).update(Buffer.from(payload, 'utf-8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const params = {};
  new URLSearchParams(event.body || '').forEach((value, key) => { params[key] = value; });

  if (!signatureIsValid(event, params)) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const keyword = (params.Body || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  if (CARRIER_KEYWORDS.has(keyword)) {
    return xml('');
  }

  return xml(`<Message>${escapeXml(REPLY)}</Message>`);
};
