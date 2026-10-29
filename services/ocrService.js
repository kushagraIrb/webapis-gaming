const axios = require('axios');
const { logger } = require('../logger');
const { resolveOcrConfig } = require('../config/ocrConfig');
const OcrSettingModel = require('../models/ocrSettingModel');

// A failure of the selected OCR engine. There is no automatic fallback to the other
// engine: the caller gets a clear error and the admin decides which engine to use
// (Admin Area -> OCR Engine in the admin panel).
//   statusCode - HTTP status the API should answer with
//   code       - stable machine-readable reason
class OcrEngineError extends Error {
    constructor(message, { engine, statusCode, code }) {
        super(message);
        this.name = 'OcrEngineError';
        this.engine = engine;
        this.statusCode = statusCode;
        this.code = code;
    }
}

const badResponse = (engine, detail) =>
    new OcrEngineError(`${engine} OCR returned an unusable response: ${detail}`, {
        engine,
        statusCode: 502,
        code: 'OCR_ENGINE_BAD_RESPONSE',
    });

// Sends the screenshot to the selected engine's service (multipart, field "image" - the
// same request the browser used to send) and returns the parsed response body.
async function postImage(config, image, fields) {
    if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
        throw new OcrEngineError('OCR needs Node.js 18 or newer on the server.', {
            engine: config.engine,
            statusCode: 503,
            code: 'OCR_RUNTIME_UNSUPPORTED',
        });
    }

    const form = new FormData();
    Object.entries(fields).forEach(([name, value]) => {
        if (value !== undefined && value !== null) form.append(name, String(value));
    });
    form.append('image', new Blob([image.buffer], { type: image.mimetype }), image.originalname);

    try {
        const response = await axios.post(config.url, form, {
            timeout: config.timeoutMs,
            maxBodyLength: Infinity,
        });
        return response.data;
    } catch (error) {
        const base = { engine: config.engine };
        if (error.response) {
            throw new OcrEngineError(`${config.label} service answered with HTTP ${error.response.status}`, {
                ...base,
                statusCode: 502,
                code: 'OCR_ENGINE_BAD_RESPONSE',
            });
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            throw new OcrEngineError(`${config.label} service did not answer within ${config.timeoutMs}ms`, {
                ...base,
                statusCode: 504,
                code: 'OCR_ENGINE_TIMEOUT',
            });
        }
        throw new OcrEngineError(`${config.label} service is unreachable (${error.code || error.message})`, {
            ...base,
            statusCode: 503,
            code: 'OCR_ENGINE_UNAVAILABLE',
        });
    }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Every engine is turned into this one shape, which is what the website has always used:
//   { extractedText, formatDate, transactionID, transactionDate, aiAnalysis }
// aiAnalysis is the full Python response (deposit save stores it and uses it for duplicate
// detection); it is null for Google, which deposit save already handles.

// Python (FastAPI):
//   { ocr_text, result: { transaction_id, transaction_date, transaction_time, transactionDate, formatDate, ... } }
// result.transaction_date is the date only ("2026-06-04"); result.transactionDate is the full
// date and time ("2026-06-04 11:47 AM"). The full one must be used, so that deposit_date saved in
// tbl_deposit_list contains the time as well, not just the date.
// The UTR is the payment identity: transactionID is result.utr only. The Python service already
// reports a "UPI transaction ID" as the utr and leaves transaction_id empty, so a screenshot with
// no UTR gets transactionID null and is rejected by the website. This applies to the Python
// engine only; the Google mapping below is unchanged.
async function extractWithPython(config, image, fields) {
    const body = await postImage(config, image, fields);
    if (!isObject(body) || (!('ocr_text' in body) && !isObject(body.result))) {
        throw badResponse(config.engine, 'expected a JSON object with "ocr_text" / "result"');
    }

    const result = isObject(body.result) ? body.result : {};
    return {
        extractedText: body.ocr_text ?? '',
        formatDate: Boolean(result.formatDate),
        transactionID: result.utr ?? null,
        transactionDate: result.transactionDate ?? null,
        aiAnalysis: body,
    };
}

// Google Vision (PHP, image_read/read_text.php):
//   { extractedText, transactionDate, formatDate, transactionID }
// When something fails the PHP script answers HTTP 200 with plain text instead of JSON.
async function extractWithGoogle(config, image, fields) {
    const body = await postImage(config, image, fields);
    if (!isObject(body) || !('extractedText' in body)) {
        throw badResponse(config.engine, 'expected a JSON object with "extractedText"');
    }

    return {
        extractedText: body.extractedText ?? '',
        formatDate: Boolean(body.formatDate),
        transactionID: body.transactionID ?? null,
        transactionDate: body.transactionDate ?? null,
        aiAnalysis: null,
    };
}

const ENGINES = {
    python: extractWithPython,
    google: extractWithGoogle,
};

// The engine chosen in the admin panel, or null when none is stored.
// Read on every request so a change applies immediately, without restarting the backend.
// If it cannot be read the request fails: guessing an engine could silently use the wrong one.
async function readSavedEngine() {
    try {
        return await OcrSettingModel.getEngine();
    } catch (error) {
        logger.error(`OCR engine setting could not be read from the database: ${error.message}`);
        throw new OcrEngineError('The OCR engine setting could not be read', {
            engine: null,
            statusCode: 503,
            code: 'OCR_SETTING_UNREADABLE',
        });
    }
}

// The single entry point for reading a deposit screenshot. Picks the engine chosen in the
// admin panel (python if none is stored) and calls only that one.
//   image  - multer memory file ({ buffer, mimetype, originalname })
//   fields - extra form fields to pass on (the services have always received deposit_amount_step1)
// Throws OcrConfigError (bad OCR_* setting) or OcrEngineError (selected engine failed).
async function extractFromScreenshot(image, fields = {}) {
    const config = resolveOcrConfig(process.env, await readSavedEngine());
    const startedAt = Date.now();

    try {
        const result = await ENGINES[config.engine](config, image, fields);
        logger.info(
            `OCR[${config.engine}, set by ${config.source}] ok in ${Date.now() - startedAt}ms ` +
            `(transactionID ${result.transactionID ? 'found' : 'missing'}, transactionDate ${result.transactionDate ? 'found' : 'missing'})`,
        );
        return { engine: config.engine, ...result };
    } catch (error) {
        logger.error(`OCR[${config.engine}, set by ${config.source}] failed after ${Date.now() - startedAt}ms: ${error.message}`);
        throw error;
    }
}

module.exports = { extractFromScreenshot, OcrEngineError };
