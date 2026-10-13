// OCR engine selection for deposit screenshots.
//
//   python  -> Python (FastAPI) OCR service            (default)
//   google  -> Google Vision OCR service (PHP, image_read/read_text.php)
//
// The engine is chosen by a super admin in the admin panel (Admin Area -> OCR Engine) and
// stored in tbl_ocr_setting. It is read on every request, so a change applies immediately.
// There is no engine setting in .env. If nothing is stored (migration not run yet, row
// missing) the default 'python' is used.
//
// Optional .env settings, for the services themselves (not for choosing the engine):
//   OCR_PYTHON_URL, OCR_GOOGLE_URL, OCR_TIMEOUT_MS
// Only the selected engine's settings are read and validated, so a missing or wrong
// setting for the engine that is NOT selected never affects the one in use.

const { logger } = require('../logger');

const SUPPORTED_ENGINES = ['python', 'google'];

// The engine that was active before the admin panel switch existed.
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

// Returns { engine, source } where source is 'admin panel' or 'default'.
function resolveEngine(savedEngine) {
    const saved = clean(savedEngine);
    if (!saved) return { engine: DEFAULT_ENGINE, source: 'default' };

    const engine = saved.toLowerCase();
    if (!SUPPORTED_ENGINES.includes(engine)) {
        throw new OcrConfigError(
            `Unsupported OCR engine "${saved.slice(0, 40)}" saved by the admin panel. Supported values: ${SUPPORTED_ENGINES.join(', ')}.`,
        );
    }
    return { engine, source: 'admin panel' };
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

// Returns { engine, source, label, url, timeoutMs } for the selected engine, or throws OcrConfigError.
//   savedEngine - the engine stored by the admin panel (null when nothing is stored)
function resolveOcrConfig(env = process.env, savedEngine = null) {
    const { engine, source } = resolveEngine(savedEngine);
    const service = ENGINE_SERVICES[engine];
    return {
        engine,
        source,
        label: service.label,
        url: resolveUrl(env, service),
        timeoutMs: resolveTimeout(env),
    };
}

// Logs the OCR service settings once at startup. The selected engine is not known here (it is
// read from the database on every request), so each engine's settings are checked and a problem
// is reported as a warning - it only matters if that engine gets selected, and it deliberately
// never stops the API (login, bets, withdrawals...) from starting.
function reportOcrConfig(env = process.env) {
    const ok = [];
    const problems = [];
    SUPPORTED_ENGINES.forEach((engine) => {
        try {
            const config = resolveOcrConfig(env, engine);
            ok.push(`${engine}: ${new URL(config.url).origin} (timeout ${config.timeoutMs}ms)`);
        } catch (error) {
            problems.push(`${engine}: ${error.message}`);
        }
    });

    if (ok.length) {
        const message = `OCR services - ${ok.join('; ')}. The engine is chosen in the admin panel (OCR Engine page), default ${DEFAULT_ENGINE}.`;
        console.log(message);
        logger.info(message);
    }
    if (problems.length) {
        const message = `OCR configuration warning - ${problems.join('; ')}. Screenshot reading fails while an affected engine is selected.`;
        console.error(message);
        logger.error(message);
    }
    if (clean(env.OCR_ENGINE)) {
        const message = 'OCR_ENGINE in .env is no longer used and can be removed. Choose the engine in the admin panel (OCR Engine page).';
        console.warn(message);
        logger.warn(message);
    }
    return { ok, problems };
}

module.exports = {
    SUPPORTED_ENGINES,
    DEFAULT_ENGINE,
    OcrConfigError,
    resolveOcrConfig,
    reportOcrConfig,
};
