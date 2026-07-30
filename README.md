# Triumph Ortho & Spine — Website

Static marketing site for Triumph Ortho & Spine, LLC.

## Stack

- Plain HTML + CSS + JS (no build step)
- Hosted on Netlify
- Auto-deploy from GitHub `main` branch

## Local preview

Just open `index.html` in a browser, or run a quick local server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

Every push to `main` auto-deploys via Netlify in ~30 seconds.

Configuration: `netlify.toml` (security headers, caching, pretty URLs).

## Contact info (live)

- Phone: `(877) 215-7246` — toll-free vanity: **1-877-215-PAIN** (tel link: `tel:+18772157246`). Marketing/hero contexts display the PAIN form; footers, contact forms, and JSON-LD use the digit form.
- Email: `info@triumphorthospine.com` — role-based public inbox (added 2026-06-04). Implemented as a Google Workspace alias on `eabdeshahian@triumphorthospine.com`; mail flows through the same Workspace mailbox, then forwards to Ehsan's personal Gmail under the `Triumph Inbound` label. Personal `eabdeshahian@triumphorthospine.com` is NOT displayed on the public site (removed 2026-05-30 to reduce direct-to-owner spam).
- Address: 2999 NE 191st St, Suite 300, Miami, FL 33180.

## Known placeholders

- `assets/hero-spartan-placeholder.svg` — replace with the brand-issued Spartan hero image (`hero-spartan.jpg` recommended) and update `index.html` `src` attribute.
- About > Doctors page is intentionally a placeholder (physician profile copy pending).

## HIPAA note

Netlify is **not** a HIPAA Business Associate. This site contains **no PHI-collecting forms**.
- The "Schedule" page links out to the athenahealth patient portal.
- The "Patient Portal" page links out to athenahealth.
- If a form is added later that collects any clinical info, move it to a HIPAA-eligible host (HIPAA Vault, Atlantic.Net) with a signed BAA. Do not add PHI forms to this Netlify site.

## Brand tokens

All design tokens are in CSS custom properties at the top of `css/styles.css`:

- Deep Navy `#071B3A`
- Royal Blue `#0D3B73`
- Antique Gold `#C9A24A`
- Ivory `#F4F1E8`
- Slate Gray `#5F6B7A`
- Primary serif: Cinzel
- Secondary sans: Montserrat
