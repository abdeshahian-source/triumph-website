# Intake Link Sender — Setup

Staff open `triumphorthospine.com/staff`, type a passcode and a mobile number, and
the patient gets a link to `/patient-portal/`. That's the whole feature.

**What the patient receives (fixed, cannot be edited from the staff screen):**

> Triumph Ortho & Spine: your new patient forms are ready. Complete them here:
> https://triumphorthospine.com/patient-portal/ Questions? Call (877) 215-7246 or
> use the chat on our website. Reply STOP to opt out.

No name. No appointment. No diagnosis. Nothing clinical. The patient clicks
through to the portal, where the existing chat widget is available for questions.

---

## Part 1 — Launch today (email only, no registration needed)

Texting cannot legally start until carrier registration clears (Part 2). Email
delivery works right now and uses the Resend key the chat widget already has.

### 1. Two steps

**a. Update the Apps Script.** Email goes out through your own Google Workspace,
which is covered by the signed BAA — no new vendor, and it sends from
info@triumphorthospine.com. Open script.google.com, open **Triumph Intake
Webhook**, and replace the contents with the updated `apps-script/Code.gs`. Near
the top, set `INTAKE_LINK_SECRET` to a long random string. Then **Deploy → Manage
deployments → Edit → New version → Deploy**. (Editing without a new version does
nothing — the old code keeps serving.)

The script can only ever send one fixed message. The website supplies a recipient
address and nothing else.

**b. Add two variables** in Netlify (**Site configuration → Environment
variables**):

| Key | Value |
|---|---|
| `INTAKE_LINK_SECRET` | the same random string you put in Code.gs |
| `STAFF_PASSWORD` | optional — defaults to `triumphadmin` if unset |

`LEAD_WEBHOOK_URL` is already set from the chat widget and is reused as-is.

The staff password is **`triumphadmin`** out of the box, so you can skip
`STAFF_PASSWORD` to start. See the note at the bottom about why you shouldn't
leave it that way for long.

If you would rather use a third-party mailer than your own Workspace, set
`RESEND_API_KEY` instead and the function falls back to it. The Workspace path is
better — one fewer vendor touching patient contact details.

If you ever want per-person passwords and a record of who sent what, set
`STAFF_CODES` in the form `lauren:4821,anita:9930,ehsan:1177`. When set it takes
precedence, and the name attached to the matching code shows on the confirmation
screen.

Leave every `TWILIO_*` variable and `SMS_ENABLED` unset for now.

### 2. Deploy

Netlify → **Deploys → Trigger deploy → Clear cache and deploy site**.

### 3. Test

Open `triumphorthospine.com/staff` — there is a **Staff** link in the footer of
every page. The banner should read **"Email only right now."** Send yourself the link by email and confirm it arrives and the button
opens the portal.

Staff can start using it the same day. When texting turns on, nothing about the
screen changes — the banner flips to green and the phone field starts working.

---

## Part 2 — Turning texting on

### There is no way around registration

Every US business text has to come from a number registered with the carriers.
Since **September 1, 2023** Twilio blocks unregistered 10-digit numbers outright
(error 30034), and unverified *and* pending toll-free numbers are fully blocked
too. You still get billed for blocked messages. There is no trial mode, grace
period, or workaround. Sending to unregistered numbers is also the fastest way to
get flagged, which makes the eventual approval harder.

So: start the registration now, run on email in the meantime.

### Which path

**Pick A2P 10DLC, Low Volume Standard.** A local number matching one of your
markets looks like a real practice; toll-free reads as a call center, and
toll-free verification is not faster.

Current timing: brand registration is often approved in minutes, campaign review
is running **10 to 15 days**. Cost is roughly $4.50 one-time for the brand, $15
for the campaign, $1.50 to $10 per month after that, plus about $0.003 to $0.005
per message in carrier fees on top of Twilio's ~$0.0079. Our message is two
segments, so budget about $0.03 per patient, all in. A local number is $1.15/mo.

### Steps

1. Create a Twilio account and upgrade off trial (trial blocks unverified
   recipients — error 21608).
2. **Phone Numbers → Buy a number.** Local, SMS-capable, area code matching
   Lawrence Township NJ, the Philadelphia area, or Miami. Buy **one** number.
3. **Messaging → Services → Create Messaging Service**, add the number to it.
   The A2P campaign attaches to the service, not the number, which is why the
   function prefers `TWILIO_MESSAGING_SERVICE_SID`.
4. **Messaging → Regulatory Compliance → A2P 10DLC.** Register the Brand using
   the exact legal name, EIN, and address on the EIN letter. A mismatch is the
   #1 cause of rejection and a re-vetting fee.
5. Register the Campaign using the answers below.
6. When the campaign shows **Approved**, add the variables in the next section
   and redeploy.

### Campaign answers to use

| Field | Answer |
|---|---|
| Use case | Low Volume Mixed — Customer Care / Account Notification |
| Campaign description | A physician-owned orthopedic and spine practice sends a single text to patients who have provided their mobile number during scheduling or registration. The message contains a link to the practice's online new patient intake forms and the practice phone number. No marketing, no promotional content, no health information. |
| Sample message 1 | Triumph Ortho & Spine: your new patient forms are ready. Complete them here: https://triumphorthospine.com/patient-portal/ Questions? Call (877) 215-7246 or use the chat on our website. Reply STOP to opt out. |
| Sample message 2 | Triumph Ortho & Spine: reply STOP to stop receiving texts, or HELP for help. Message and data rates may apply. |
| Opt-in type | Verbal / in person |
| Opt-in description | Patients provide their mobile number verbally to practice staff while scheduling an appointment, or in writing on the registration form, and are told at that time that they will receive a text with a link to complete their new patient paperwork. Staff then enter the number into an internal, passcode-protected tool at triumphorthospine.com/staff. There is no public web form and no online sign-up for these messages. |
| Opt-out | Reply STOP. Handled automatically by Twilio. Patients may also call (877) 215-7246. |
| Help | Reply HELP, or call (877) 215-7246. |
| Privacy policy URL | https://triumphorthospine.com/legal/privacy.html |
| Terms URL | https://triumphorthospine.com/legal/terms.html |

The privacy policy now carries the SMS section the carriers look for, including
the required "we do not sell or share mobile numbers or SMS consent" language.
Do not remove it — campaigns get rejected without it.

### Variables to add once approved

| Key | Value |
|---|---|
| `SMS_ENABLED` | `true` |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | your auth token |
| `TWILIO_MESSAGING_SERVICE_SID` | `MGxxxxxxxx` |

(`TWILIO_FROM` with the raw number works as a fallback if you skip the Messaging
Service, but don't — the campaign needs it.)

Then redeploy. Also turn on **message body redaction** in the Twilio console so
Twilio stops retaining message text in its logs.

### Test after approval

1. Send to your own mobile. Confirm the link opens the portal on a phone.
2. Reply STOP from that phone. Confirm you get the opt-out confirmation.
3. Send to that same number again. It should come back "opted out — use email
   instead," not a silent failure.
4. Enter a landline. Should fail cleanly with a readable message.
5. Enter a wrong passcode. Should be rejected.

---

## Security

The passcode check runs **inside the function**, not in the page. A hidden URL
alone would be an open SMS relay — anyone who found it could burn your Twilio
balance and get your number flagged by the carriers, which would undo the
registration. Do not remove the passcode gate.

Other guardrails already in place:

- The message text is hard-coded server-side. The browser cannot supply or alter
  it, so this endpoint can never send arbitrary content.
- The function only accepts requests originating from triumphorthospine.com.
- Twenty sends per minute per instance, then it throttles.
- `/staff/*` carries `X-Robots-Tag: noindex` and `Cache-Control: no-store`.
- Nothing is written to storage. Logs record the staff name and sent/failed only,
  never the recipient's number or email.
- Patient first name is typed in the browser purely so staff can confirm the
  right person on screen. It is never sent to the server.

**On the password.** `triumphadmin` is short, guessable, and the `/staff` link is
in the public footer of ninety pages, so assume scanners will find and try it. The
function slows every wrong guess by 1.2 seconds and stops answering after five bad
attempts in a minute, which makes brute-forcing impractical, but a targeted guess
still works on the first try. The realistic damage is someone firing your intake
link at strangers, which burns Twilio balance and gets the number carrier-flagged
— the one thing that undoes the A2P approval. Setting `STAFF_PASSWORD` to
something like `triumph-Sx7mQ2` removes that entirely and costs one variable and
one redeploy. Rotate it whenever someone leaves.

## Where PHI stands

A text saying "your forms from Triumph Ortho & Spine are ready" still identifies
the recipient as a patient of a pain and spine practice, and Netlify is not a
business associate. Keeping the name and all clinical detail out of the message
and storing nothing shrinks that exposure to about as small as it gets on this
architecture, but it does not make it zero. If you want it fully clean later, the
send function is the one piece that would move to a HIPAA-eligible host, or to
Twilio under a BAA (Security or Enterprise Edition).

## Files

| File | Purpose |
|---|---|
| `netlify/functions/send-intake-link.js` | Backend. Holds the Twilio credentials, owns the message text. |
| `staff/index.html` | The staff screen. Self-contained, no dependencies. |
| `netlify.toml` | noindex + no-store headers for `/staff/*` and `/patient-portal/*`. |
| `legal/privacy.html` | SMS disclosure section required for A2P approval. |
| `apps-script/Code.gs` | Sends the email from your Workspace. Owns that message text. |
