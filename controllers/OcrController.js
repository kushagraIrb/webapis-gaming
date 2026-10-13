const { logger } = require('../logger');
const ocrService = require('../services/ocrService');
const { OcrConfigError } = require('../config/ocrConfig');

// What the user sees for each failure. The technical detail (engine, HTTP status, timeout...)
// is only written to the server log.
const FAILURES = {
    OCR_CONFIG_INVALID: 'Screenshot reading is not set up correctly right now. Please contact support.',
    OCR_RUNTIME_UNSUPPORTED: 'Screenshot reading is not available right now. Please contact support.',
    OCR_ENGINE_UNAVAILABLE: 'Screenshot reading is temporarily unavailable. Please try again in a few minutes.',
    OCR_SETTING_UNREADABLE: 'Screenshot reading is temporarily unavailable. Please try again in a few minutes.',
    OCR_ENGINE_TIMEOUT: 'Reading the screenshot took too long. Please try again.',
    OCR_ENGINE_BAD_RESPONSE: 'We could not read this screenshot. Please try again.',
};

class OcrController {
    // Read a deposit screenshot with the OCR engine chosen in the admin panel.
    // Responds with the same data the website has always used after reading a screenshot:
    // { extractedText, formatDate, transactionID, transactionDate, aiAnalysis } (+ engine).
    async extractImage(req, res) {
        if (!req.file) {
            return res.status(400).send({ status: false, message: 'Please upload a screenshot.' });
        }

        try {
            const data = await ocrService.extractFromScreenshot(req.file, {
                deposit_amount_step1: req.body.deposit_amount_step1,
            });

            return res.status(200).send({
                status: true,
                message: 'Screenshot read successfully',
                data,
            });
        } catch (error) {
            const isConfigError = error instanceof OcrConfigError;
            const code = error.code && FAILURES[error.code] ? error.code : null;

            if (isConfigError) {
                logger.error(`OCR request rejected, invalid configuration: ${error.message}`);
            } else if (!code) {
                logger.error(`Unexpected error while reading screenshot: ${error.message}`, { stack: error.stack });
            }

            return res.status(isConfigError ? 503 : error.statusCode || 500).send({
                status: false,
                code: code || 'OCR_FAILED',
                message: code ? FAILURES[code] : 'Failed to read the screenshot. Please try again.',
            });
        }
    }
}

module.exports = new OcrController();
