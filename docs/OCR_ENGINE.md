# OCR engine for deposit screenshots

When a user uploads a deposit screenshot, the website reads the transaction ID and date from it
with OCR. Two engines exist, and **a super admin chooses which one is used in the admin panel**
(Admin Area -> OCR Engine):

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

Admin panel (Admin Area -> OCR Engine, super admins only)
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

1. Log in to the admin panel as a super admin (the ids in the admin API's `config/superAdmins.js`).
2. Open **Admin Area -> OCR Engine**, pick the engine, press **Save** and confirm.

That is all. The panel shows the current engine and who changed it last. Other admins cannot see
the page, and the admin API refuses their requests (HTTP 403).

## One-time setup (database)

Run `migrations/20261013-ocr-engine-setting.sql` (in the admin panel's Node repo) once on every
database the admin panel and user backend share. It creates `tbl_ocr_setting` and seeds it with
`python`, the engine that is active today. Run it before opening the OCR Engine page.

Until it has run, the user backend simply uses Python, and the admin page says the table is
missing. A server whose `.env` still has `OCR_ENGINE` can remove it: it is ignored, and the
backend logs a reminder at startup.

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
