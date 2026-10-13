// OCR engine selection for deposit screenshots.
//
//   OCR_ENGINE=python  -> Python (FastAPI) OCR service            (default)
//   OCR_ENGINE=google  -> Google Vision OCR service (PHP, image_read/read_text.php)
//
// Only the selected engine's settings are read and validated, so a missing or
// wrong setting for the engine that is NOT selected never affects the one in use.
// The values come from .env, which is read once when the process starts - see
// docs/OCR_ENGINE.md for how to switch.

const { logger } = require('../logger');

const SUPPORTED_ENGINES = ['python', 'google'];

// The engine that was active before this setting existed. Used when OCR_ENGINE is missing/empty.
const DEFAULT_ENGINE = 'python';

// Service URL per engine. The defaults are the services the site already uses,
// so leaving the URL variables out of .env keeps today's behaviour.
const ENGINE_SERVICES = {
    python: {
        label: 'Python OCR',
        urlEnv: 'OCR_PYTHON_URL',
        defaultUrl: 'https://improcessing.gaminghelperonline.com/extract-image',
    },
    google: {
        label: 'Google OCR',
        urlEnv: 'OCR_GOOGLE_URL',
        defaultUrl: 'https://iimageprocessing.gaminghelperonline.com/image_read/read_text.php',
    },
};

// Kept below the usual 60s reverse-proxy timeout so the API answers with a clear
// error before the proxy cuts the request off.
const DEFAULT_TIMEOUT_MS = 45000;

class OcrConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OcrConfigError';
        this.code = 'OCR_CONFIG_INVALID';
    }
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

function resolveEngine(env) {
    const raw = clean(env.OCR_ENGINE);
    if (!raw) return DEFAULT_ENGINE;

    const engine = raw.toLowerCase();
    if (!SUPPORTED_ENGINES.includes(engine)) {
        throw new OcrConfigError(
            `Unsupported OCR_ENGINE "${raw.slice(0, 40)}". Supported values: ${SUPPORTED_ENGINES.join(', ')}. ` +
            `Leave it unset to use the default (${DEFAULT_ENGINE}).`,
        );
    }
    return engine;
}

function resolveUrl(env, service) {
    const url = clean(env[service.urlEnv]) || service.defaultUrl;
    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        throw new OcrConfigError(`${service.urlEnv} is not a valid URL.`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new OcrConfigError(`${service.urlEnv} must start with http:// or https://.`);
    }
    return url;
}

function resolveTimeout(env) {
    const raw = clean(env.OCR_TIMEOUT_MS);
    if (!raw) return DEFAULT_TIMEOUT_MS;

    const timeoutMs = Number(raw);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new OcrConfigError('OCR_TIMEOUT_MS must be a positive whole number of milliseconds.');
    }
    return timeoutMs;
}

// Returns { engine, label, url, timeoutMs } for the selected engine, or throws OcrConfigError.
function resolveOcrConfig(env = process.env) {
    const engine = resolveEngine(env);
    const service = ENGINE_SERVICES[engine];
    return {
        engine,
        label: service.label,
        url: resolveUrl(env, service),
        timeoutMs: resolveTimeout(env),
    };
}

// Logs the selected engine once at startup. An invalid value is reported loudly here and
// makes OCR requests fail with a clear error - it deliberately does not stop the whole
// API (login, bets, withdrawals...) from starting.
function reportOcrConfig(env = process.env) {
    try {
        const config = resolveOcrConfig(env);
        const message = `OCR engine: ${config.engine} (${config.label}, ${new URL(config.url).origin}, timeout ${config.timeoutMs}ms)`;
        console.log(message);
        logger.info(message);
        return config;
    } catch (error) {
        const message = `OCR configuration error: ${error.message} Deposit screenshot reading will fail until this is fixed.`;
        console.error(message);
        logger.error(message);
        return null;
    }
}

module.exports = {
    SUPPORTED_ENGINES,
    DEFAULT_ENGINE,
    OcrConfigError,
    resolveOcrConfig,
    reportOcrConfig,
};
