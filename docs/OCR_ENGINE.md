# OCR engine for deposit screenshots

When a user uploads a deposit screenshot, the website reads the transaction ID and date from it
with OCR. Two engines exist, and **an admin with the OCR Engine right chooses which one is used in
the admin panel** (Admin Area -> OCR Engine). Super admins always have that right:

| Engine | Service |
|---|---|
| Python OCR (default) | FastAPI service, `POST /extract-image` |
| Google OCR | Google Vision, PHP service `image_read/read_text.php` |

There is no engine setting in `.env`. The choice is stored in the database and read on every
screenshot, so a change applies to the very next upload: **no restart and no redeploy**.

## How a request flows

```
Browser (Gaming-Helper)
  POST /api/deposit/extract-image   (image + deposit_amount_step1, user must be logged in)
        |
        v
Node backend (webapis-gaming)
  routes/depositRouter.js -> helpers/ocrUpload.js -> controllers/OcrController.js
        |
        v
  services/ocrService.js  -- reads the engine from tbl_ocr_setting and calls ONLY that engine
        |                    then turns its answer into one common result
        +--> python : OCR_PYTHON_URL
        +--> google : OCR_GOOGLE_URL

Admin panel (Admin Area -> OCR Engine; needs the "OCR Engine" right, super admins always have it)
  PUT /api/ocr-engine  ->  tbl_ocr_setting (single row, id = 1)  <-  read by the user backend
```

The browser always gets the same result, whichever engine ran:

```json
{ "status": true, "message": "...", "data": {
    "engine": "python",
    "extractedText": "...", "formatDate": true,
    "transactionID": "...", "transactionDate": "...",
    "aiAnalysis": { } } }
```

`aiAnalysis` is the full Python response, which deposit save stores and uses for duplicate
detection. It is `null` for Google. Nothing else in deposit save or validation changes.

## Switching engines

1. Log in to the admin panel as a super admin, or as an admin who was given the OCR Engine right.
2. Open **Admin Area -> OCR Engine**, pick the engine, press **Save** and confirm.

That is all. The panel shows the current engine and who changed it last. Admins without the right
cannot see the page, and the admin API refuses their requests (HTTP 403).

## Who can use it

The page and its API need the right **OCR Engine -> Full Access** (`ocr_engine_access`). It is
listed in **Admin Area -> Manage Admin User -> Manage Rights** like every other right.

- Super admins (the ids in the admin API's `config/superAdmins.js`) always have it.
- Nobody else has it until a super admin ticks it for them.
- Only super admins can grant or revoke this one right. The rights API itself only checks that
  the caller is logged in, so the admin API refuses any change to this right from anyone else
  (HTTP 403), including for themselves. All other rights work as before.

## One-time setup (database)

Run these two files (in the admin panel's Node repo, `migrations/`) once on every database the
admin panel and user backend share, before opening the OCR Engine page:

1. `20261013-ocr-engine-setting.sql` creates `tbl_ocr_setting` and seeds it with `python`, the
   engine that is active today.
2. `20261013-ocr-engine-permission.sql` adds the `ocr_engine_access` right to the rights module.

Both are safe to run again; neither overwrites anything. Until the first has run, the user backend
simply uses Python, and the admin page says the table is missing. Until the second has run, only
super admins can use the page, because the right does not exist to be granted. A server whose
`.env` still has `OCR_ENGINE` can remove it: it is ignored, and the backend logs a reminder at startup.

## Optional `.env` settings

These are for the OCR services themselves, not for choosing the engine:

| Setting | Default | Meaning |
|---|---|---|
| `OCR_PYTHON_URL` | the current Python service | Used while Python OCR is selected. |
| `OCR_GOOGLE_URL` | the current Google (PHP) service | Used while Google OCR is selected. |
| `OCR_TIMEOUT_MS` | `45000` | How long to wait for the engine. Keep it below the reverse-proxy timeout (usually 60 s). |

Only the selected engine's URL is used and checked. A wrong Google URL does not affect Python,
and a Python service that is down does not affect Google. These values are read when the
backend starts, so changing them needs a restart (`pm2 restart gamingLive` in production,
`gamingDev` on dev). The Google credentials (the Vision key file) live on the PHP service, not in
this backend.

## When something is wrong

There is **no automatic fallback** to the other engine. The user sees a short message, and the
reason is in the server log (`errors/<date>.log`).

| Situation | HTTP | `code` |
|---|---|---|
| The selected engine's settings are invalid (URL, timeout) | 503 | `OCR_CONFIG_INVALID` |
| The saved engine value cannot be read from the database | 503 | `OCR_SETTING_UNREADABLE` |
| Engine service unreachable | 503 | `OCR_ENGINE_UNAVAILABLE` |
| Engine did not answer within `OCR_TIMEOUT_MS` | 504 | `OCR_ENGINE_TIMEOUT` |
| Engine answered with an error or an unusable reply | 502 | `OCR_ENGINE_BAD_RESPONSE` |
| No file / not an image | 400 | |
| File over 10 MB | 413 | |

A problem with an OCR setting is also logged at startup (`OCR configuration warning ...`) and only
fails screenshot reading while the affected engine is selected; the rest of the site keeps running.

## Python vs Google: what changes for deposits

In Google mode no `aiAnalysis` is produced, so the checks that depend on it do not run: the
AI duplicate detection (transaction ID / UTR / reference cross-check) and the AI amount
comparison. The older checks still apply (exact deposit ID match and the manual-deposit
last-5-digits check). This is how deposits worked before the Python OCR was added. The admin
panel warns about this before switching to Google.

### `tbl_deposit_list.deposit_amount`

| Selected engine | `deposit_amount` | `deposit_amount_step1` |
|---|---|---|
| Python, amount read | the amount read from the screenshot | the amount the user entered |
| Python, amount not read | `NULL` (a visible "extraction failed" signal) | the amount the user entered |
| Google | **the amount the user entered, identical to `deposit_amount_step1`** | the amount the user entered |

Google cannot read the amount, so while it is selected the two columns always match, and an admin
comparing them will never see a mismatch. This is decided on the server from the engine selected
in the admin panel, never from what the browser sends, and only when the request carries no AI
data: an AI amount that does arrive is never overwritten, and a Python-mode deposit that arrives
without AI data still gets `NULL`. The wallet credit always uses the amount the user entered,
whatever the engine. If the setting cannot be read at that moment the deposit is still saved, with
`NULL`.
