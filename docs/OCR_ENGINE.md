# OCR engine for deposit screenshots

When a user uploads a deposit screenshot, the website reads the transaction ID and date from it
with OCR. Two engines exist and **one setting, `OCR_ENGINE`, chooses which one is used**:

| `OCR_ENGINE` | Engine | Service |
|---|---|---|
| `python` (default) | Python OCR | FastAPI service, `POST /extract-image` |
| `google` | Google Vision OCR | PHP service, `image_read/read_text.php` |

No code needs to be commented or uncommented to switch.

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
  services/ocrService.js  -- reads OCR_ENGINE (config/ocrConfig.js) and calls ONLY that engine
        |                    then turns its answer into one common result
        +--> python : OCR_PYTHON_URL
        +--> google : OCR_GOOGLE_URL
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

## Settings (backend `.env`)

| Setting | Default | Meaning |
|---|---|---|
| `OCR_ENGINE` | `python` | `python` or `google` (case-insensitive). Anything else is reported as an error. |
| `OCR_PYTHON_URL` | the current Python service | Only read when `OCR_ENGINE=python`. |
| `OCR_GOOGLE_URL` | the current Google (PHP) service | Only read when `OCR_ENGINE=google`. |
| `OCR_TIMEOUT_MS` | `45000` | How long to wait for the engine. Keep it below the reverse-proxy timeout (usually 60 s). |

Only the selected engine's settings are read and checked. A wrong Google URL does not affect
Python mode, and a Python service that is down does not affect Google mode.

The Google credentials (the Vision key file) live on the PHP service, not in this backend, so
there is nothing Google-related to configure here except its URL.

## Switching engines

1. On the server, edit the backend `.env` (the deploy never touches it) and set `OCR_ENGINE=google` or `OCR_ENGINE=python`.
2. Restart the backend: `pm2 restart gamingLive` (production) or `pm2 restart gamingDev` (dev).
3. Check the startup log (PM2 logs, or `info/<date>.log`) for the line
   `OCR engine: google (Google OCR, https://..., timeout 45000ms)`.

`.env` is read once when the backend starts, so the restart is required. No redeploy, no
frontend change, and no restart of the Python or PHP services is needed.

## When something is wrong

There is **no automatic fallback** to the other engine. The user sees a short message, and the
reason is in the server log (`errors/<date>.log`).

| Situation | HTTP | `code` |
|---|---|---|
| `OCR_ENGINE` (or another selected `OCR_*` value) is invalid | 503 | `OCR_CONFIG_INVALID` |
| Engine service unreachable | 503 | `OCR_ENGINE_UNAVAILABLE` |
| Engine did not answer within `OCR_TIMEOUT_MS` | 504 | `OCR_ENGINE_TIMEOUT` |
| Engine answered with an error or an unusable reply | 502 | `OCR_ENGINE_BAD_RESPONSE` |
| No file / not an image | 400 | |
| File over 10 MB | 413 | |

An invalid `OCR_ENGINE` is logged at startup (`OCR configuration error: Unsupported OCR_ENGINE ...`)
and fails only screenshot reading; the rest of the site keeps running.

## Python vs Google: what changes for deposits

In Google mode no `aiAnalysis` is produced, so the checks that depend on it do not run: the
AI duplicate detection (transaction ID / UTR / reference cross-check) and the AI amount
comparison. The older checks still apply (exact deposit ID match and the manual-deposit
last-5-digits check). This is how deposits worked before the Python OCR was added.
