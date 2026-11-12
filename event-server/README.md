# Verdano event password hunt

This service belongs to the main Verdano website. It does not import Gestor,
use its login, or modify its database. Node.js 24+ is required (built-in SQLite).
GitHub Pages alone cannot run this backend; the host must run Node alongside Caddy.

## Setup and operation

From the website repository:

```powershell
npm ci
npm run check
npm test
npm start
```

The service binds only to `127.0.0.1:3100`. The included Caddy routes forward
`/evento/*` to it, leaving the main landing page and `/teste/gestor` independent.
Keep 3100 private. Start/stop this service with the other manual event processes;
there is no service installation or automatic startup.

On first start (or QR generation), it creates `event-server/runtime/event.sqlite`
with four permanent random checkpoint paths and a stand access key. Passwords
are generated on page visits, not while making the QR images. Every issued code
is five case-sensitive ASCII letters/digits, generated with cryptographic
randomness; collisions are retried against all previous codes. Only password
hashes are saved, so previously displayed passwords cannot be recovered.

Back up the whole runtime directory while stopped, or use SQLite's backup tools
while running. Do not delete or replace the database after printing: it holds
the checkpoint URLs, stand key, issued codes and redemption history. Changing
the public hostname/port requires reprinting. Used codes never become available
again. There is no public password list, checkpoint list or reset endpoint.

Configuration (environment):

- `EVENT_DATA_DIR`: persistent private directory (default `event-server/runtime`).
- `EVENT_PORT`: loopback port (default 3100; update Caddy if changed).
- `EVENT_PUBLIC_ORIGIN`: QR origin (default `http://www.verdano.com.br:18080`).
- `EVENT_GAME_ORIGIN`: exact allowed browser origin, no trailing slash (same default).
- `EVENT_STAND_KEY`: optional override for the generated stand key. Restart after changing it.

The default stand key can be read **locally by the operator** with:

```powershell
node -e "const {EventStore}=require('./event-server/store.cjs'); const s=new EventStore('./event-server/runtime/event.sqlite'); console.log(s.standKey()); s.close()"
```

Give that key privately to the stand operator/game developer. Never commit it,
embed it in public frontend source, log it, or put it in a query string. The stand
website can ask the operator to enter it at session start and hold it in memory,
or its own server can make the request. Visitors do not need this key or an app.
CORS is an extra browser restriction; the key is what authorizes redemption.
HTTP port 18080 is the requested temporary event setup and does not encrypt
codes or the stand key in transit. Use HTTPS for a future public deployment.

## Print the four QRs

```powershell
npm run event:qr
```

Open `event-server/print/imprimir.html` and print its four separate pages. Each
PNG contains a centered VagaLumen symbol, high error correction, and a four-module
white quiet zone. `qr-links.json` records the exact printed URLs. Print outputs
are intentionally ignored by Git: uploading them would publish the secret paths.
No homepage or navigation links are added. Pages use noindex/noarchive, no-store,
and no-referrer. Links are unguessable, but someone can still share them.

A normal camera opens `/evento/p/<48-random-hex-characters>`. Each real page GET
issues a new code for its checkpoint, including refreshes. Prefetches and HEAD
do not issue codes. Visitors should screenshot/note the displayed password.
Each checkpoint issues at most 60 pages per minute per IP, with a global cap of
1,000 per minute. A shared stand Wi-Fi can hit the per-IP limit; adjust deliberately
if expected attendance requires it. These in-memory limits reset on restart.

## Game integration — API contract

**POST `http://www.verdano.com.br:18080/evento/api/redeem`**

Headers:

```http
Content-Type: application/json
X-Stand-Key: <privately supplied stand key>
```

Body:

```json
{
  "submissionId": "e7033097-5172-414b-86fe-eed60e14c984",
  "passwords": ["Ab3kZ", "9qLm2", "Rc7Yx", "4pNd8"]
}
```

`submissionId` must be 16–80 letters/digits/hyphens; use `crypto.randomUUID()`.
Create one ID for each attempted set. **Reuse the same ID AND the exact array in
its original order on transport errors/timeouts.** Do not show success until
an HTTP 200 response with `success: true` arrives. An identical retry after a
successful redemption returns the same success. A corrected or new set needs
a new ID; reusing a successful ID with different values returns 409.

The array must contain exactly four five-character alphanumeric strings. Order
is flexible on first submission: the server checks checkpoint membership itself.
Do not lowercase codes. Trim accidental surrounding whitespace in the game UI.
No visitor account, app, cookie or checkpoint number is required.

**200 — accepted (or an identical successful retry):**

```json
{"success":true,"redemptionId":"e7033097-5172-414b-86fe-eed60e14c984"}
```

**422 — rejected, no code is consumed:**

```json
{"success":false,"errors":[{"position":2,"code":"ALREADY_USED"}]}
```

Positions are 1-based positions in the submitted array, not checkpoint IDs.
Possible per-entry errors and suggested Portuguese text:

| Code | Meaning / game message |
| --- | --- |
| `INVALID_PASSWORD` | “A senha 2 está incorreta.” |
| `ALREADY_USED` | “A senha 2 já foi utilizada.” |
| `DUPLICATE_CHECKPOINT` | “A senha 2 é de um ponto já informado. Encontre outro QR code.” |

All detected errors can be returned together. Repeated checkpoint codes are
flagged from the second occurrence, even if the strings differ. Four codes from
the same checkpoint cannot win. If every entry is valid and unused and represents
a different checkpoint, all four are consumed in one SQLite transaction. Two
concurrent submissions cannot consume the same set twice.

Other responses have `success: false` and a top-level `code`:

| Status | Code | Action |
| --- | --- | --- |
| 400 | `INVALID_JSON`, `INVALID_REQUEST` | Fix request shape; not a password verdict. |
| 401 | `UNAUTHORIZED` | Check the operator's stand key. |
| 403 | `ORIGIN_NOT_ALLOWED` | Configure the actual stand website origin. |
| 409 | `IDEMPOTENCY_CONFLICT` | Do not reuse an ID for another set. |
| 413 | `BODY_TOO_LARGE` | JSON must be at most 2 KiB. |
| 415 | `JSON_REQUIRED` | Send application/json. |
| 429 | `RATE_LIMITED` | Wait; no code is consumed (global 300 redemption attempts/minute). |
| 503 | `TEMPORARILY_UNAVAILABLE` | Retry the same submission ID and array. |

Example (call this from the stand game, with a privately entered key):

```js
const submission = {
  submissionId: crypto.randomUUID(),
  passwords: fields.map(value => value.trim()),
};
async function sendSubmission() {
  const response = await fetch('http://www.verdano.com.br:18080/evento/api/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stand-Key': operatorKey },
    body: JSON.stringify(submission),
  });
  const result = await response.json();
  if (response.ok && result.success === true) showVictory(result.redemptionId);
  else showErrors(result); // retain submission for network retry; new ID for edits
}
```

An HTTPS game cannot call an HTTP API from a browser (mixed content); serve the
stand game on this HTTP origin for the temporary setup or deploy both via HTTPS.
One prize per person remains an in-person staff check; codes do not identify people.

## Checks

`npm test` covers issuance uniqueness, checkpoint membership, invalid and used
codes, no partial consumption, persistent state, simultaneous submissions,
idempotency, HTTP auth/CORS/limits, and decoding centered-logo QRs at two sizes.
`npm run check` parses the service and generator. Test the actual printed QRs
with normal Android/iPhone cameras before the event.
