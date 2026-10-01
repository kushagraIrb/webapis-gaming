const { logger } = require('../logger');
const DepositAiAnalysisModel = require('../models/depositAiAnalysisModel');

/**
 * Business-logic layer for tbl_deposit_ai_analysis.
 *
 * CRITICAL DESIGN RULE
 * --------------------
 * saveAiAnalysis() MUST NEVER throw or propagate errors.
 * It is always called fire-and-forget from depositService after a successful
 * tbl_deposit_list insert.  Any failure here is logged and silently swallowed
 * so the deposit confirmation response is never affected.
 *
 * Dashboard methods (getSuspiciousDeposits, getReviewQueue, etc.) are stubs
 * provided for future admin-panel wiring — they are NOT exposed via any route
 * at this stage.
 */
class DepositAiAnalysisService {

    // ─────────────────────────────────────────────────────────────────────────
    // WRITE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Map a FastAPI /extract-image response onto tbl_deposit_ai_analysis
     * columns and persist the row.
     *
     * Field mapping
     * -------------
     * FastAPI field                          → DB column
     * ─────────────────────────────────────────────────
     * request_id                             → request_id
     * result.amount                          → amount
     * result.transaction_id                  → transaction_id
     * result.utr                             → utr
     * result.payment_reference_ids (string[])→ payment_reference_ids (JSON)
     * result.transaction_date (YYYY-MM-DD)   → transaction_date
     * result.transaction_time                → transaction_time
     * result.transaction_status              → transaction_status
     * result.receiver_name                   → receiver_name
     * result.payment_app                     → payment_app
     * result.bank_name                       → bank_name
     * result.template                        → template_name   ← renamed
     * result.confidence_score                → confidence_score
     * result.quality                         → quality
     * fraud.fraud_score                      → fraud_score
     * fraud.fraud_flags                      → fraud_flags (JSON)
     * fraud.is_suspicious                    → is_suspicious
     * review_required                        → review_required
     * review_reasons                         → review_reasons (JSON)
     * vector_context.nearest_similarity      → nearest_similarity
     * vector_context.template_hint           → vector_template_hint  ← renamed
     * ocr_text                               → ocr_text
     * <entire response>                      → full_response (JSON)
     *
     * @param {number}             depositListId  tbl_deposit_list.id
     * @param {object|string|null} aiResponse     Full FastAPI JSON response
     *                                            (may arrive as a JSON string
     *                                            from multipart/form-data)
     * @param {string|null}        imageName      Multer filename (screenshot)
     * @returns {Promise<void>}
     */
    static async saveAiAnalysis(depositListId, aiResponse, imageName = null) {
        // ── Guard: skip gracefully when no AI data was sent ──────────────────
        if (!aiResponse) {
            logger.info(
                `DepositAiAnalysisService: no AI response for deposit_list_id=${depositListId} — skipping`
            );
            return;
        }

        try {
            // ── Parse JSON string when arriving via multipart/form-data ───────
            let parsed = aiResponse;
            if (typeof aiResponse === 'string') {
                try {
                    parsed = JSON.parse(aiResponse);
                } catch (_) {
                    logger.error(
                        `DepositAiAnalysisService: ai_analysis is not valid JSON for deposit_list_id=${depositListId}`
                    );
                    return;
                }
            }

            if (typeof parsed !== 'object' || parsed === null) {
                logger.error(
                    `DepositAiAnalysisService: ai_analysis is not an object for deposit_list_id=${depositListId}`
                );
                return;
            }

            const result = parsed.result          || {};
            const fraud  = parsed.fraud           || {};
            const vector = parsed.vector_context  || {};

            // ── Sanitise transaction_date → must be DATE (YYYY-MM-DD only) ───
            // Python may send the combined "transactionDate" in result.transaction_date;
            // we only want the 10-char date portion so the DB DATE column accepts it.
            let transactionDate = result.transaction_date || null;
            if (transactionDate) {
                transactionDate = String(transactionDate).slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
                    transactionDate = null;
                }
            }

            const data = {
                deposit_list_id:      depositListId,
                request_id:           parsed.request_id                 || null,
                image_name:           imageName                         || null,
                amount:               result.amount                     ?? null,
                transaction_id:       result.transaction_id             || null,
                utr:                  result.utr                        || null,
                // Array of ALL payment identifiers found (transaction_id, UTR, RRN, etc.)
                // Stored as JSON.  Defaults to [] so the column is never NULL when
                // the extraction ran but found no identifiers.
                payment_reference_ids: Array.isArray(result.payment_reference_ids)
                    ? result.payment_reference_ids
                    : [],
                transaction_date:     transactionDate,
                transaction_time:     result.transaction_time           || null,
                transaction_status:   result.transaction_status         || null,
                receiver_name:        result.receiver_name              || null,
                payment_app:          result.payment_app                || null,
                bank_name:            result.bank_name                  || null,
                template_name:        result.template                   || null,  // "template" → template_name
                confidence_score:     result.confidence_score           ?? null,
                quality:              result.quality                    || null,
                fraud_score:          fraud.fraud_score                 ?? null,
                fraud_flags:          fraud.fraud_flags                 ?? [],
                is_suspicious:        fraud.is_suspicious               ?? false,
                review_required:      parsed.review_required            ?? false,
                review_reasons:       parsed.review_reasons             ?? [],
                nearest_similarity:   vector.nearest_similarity         ?? null,
                vector_template_hint: vector.template_hint              || null,  // vector_context.template_hint
                ocr_text:             parsed.ocr_text                   || null,
                full_response:        parsed,                                      // entire FastAPI response
            };

            await DepositAiAnalysisModel.saveAiAnalysis(data);

            logger.info(
                `DepositAiAnalysisService: saved AI analysis ` +
                `deposit_list_id=${depositListId} ` +
                `template=${data.template_name || 'n/a'} ` +
                `confidence=${data.confidence_score ?? 'n/a'} ` +
                `fraud_score=${data.fraud_score ?? 'n/a'} ` +
                `review_required=${data.review_required}`
            );

        } catch (error) {
            // ── CRITICAL: swallow all errors — deposit already succeeded ─────
            logger.error(
                `DepositAiAnalysisService: failed to save AI analysis ` +
                `for deposit_list_id=${depositListId}: ${error.message}`,
                { stack: error.stack }
            );
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // DUPLICATE DETECTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Determine whether a new deposit submission is a duplicate of any
     * previously stored deposit, using the AI analysis identifiers.
     *
     * ── Detection strategy ────────────────────────────────────────────────────
     * Hybrid — three sequential checks in priority order:
     *
     *   Step 1  transaction_id exact match  (indexed column, O(log n))
     *   Step 2  utr exact match             (indexed column, O(log n))
     *   Step 3  cross-field safety net      (IN on indexed cols + JSON_CONTAINS)
     *
     * Each step returns the first match found.  Steps 1+2 handle the common
     * cases.  Step 3 is the key innovation for Case 4 — different payment apps
     * that show different identifiers for the same underlying bank transaction
     * (e.g. BHIM shows Transaction ID, bank app shows only the UTR/RRN).
     *
     * ── Safety contract ───────────────────────────────────────────────────────
     * This method NEVER throws.  Any DB error is caught, logged, and returns
     * { duplicate_found: false } so a legitimate deposit is never blocked by
     * infrastructure failure in the duplicate-check layer.
     *
     * @param {object|string|null} aiResponse
     *   Full FastAPI /extract-image response.  May arrive as a JSON string
     *   when forwarded from multipart/form-data.
     *
     * @returns {Promise<{
     *   duplicate_found: boolean,
     *   reason?:             'transaction_id_match'|'utr_match'|'payment_reference_match',
     *   existing_deposit_id?: number
     * }>}
     */
    static async checkDuplicateDeposit(aiResponse) {

        if (!aiResponse) {
            logger.info('checkDuplicateDeposit: no AI response provided — skipping');
            return { duplicate_found: false };
        }

        try {
            // ── Parse JSON string when arriving via multipart/form-data ───────
            let parsed = aiResponse;
            if (typeof aiResponse === 'string') {
                try {
                    parsed = JSON.parse(aiResponse);
                } catch (_) {
                    logger.warn('checkDuplicateDeposit: ai_analysis is not valid JSON — skipping duplicate check');
                    return { duplicate_found: false };
                }
            }

            if (typeof parsed !== 'object' || parsed === null) {
                logger.warn('checkDuplicateDeposit: ai_analysis is not an object — skipping');
                return { duplicate_found: false };
            }

            const result              = parsed.result || {};
            const transaction_id      = result.transaction_id      || null;
            const utr                 = result.utr                 || null;
            const payment_reference_ids = Array.isArray(result.payment_reference_ids)
                ? result.payment_reference_ids
                : [];

            // ── Log what we are searching for ─────────────────────────────────
            logger.info(
                `checkDuplicateDeposit: searching — ` +
                `transaction_id=${transaction_id ?? 'null'} | ` +
                `utr=${utr ?? 'null'} | ` +
                `payment_reference_ids=[${payment_reference_ids.join(', ')}]`,
            );

            // Nothing identifiable in the AI response — skip
            if (!transaction_id && !utr && payment_reference_ids.length === 0) {
                logger.info('checkDuplicateDeposit: no payment identifiers in AI response — skipping duplicate check');
                return { duplicate_found: false };
            }

            // ── Run detection ─────────────────────────────────────────────────
            const match = await DepositAiAnalysisModel.findDuplicateTransaction({
                transaction_id,
                utr,
                payment_reference_ids,
            });

            if (match) {
                logger.warn(
                    `checkDuplicateDeposit: DUPLICATE DETECTED — ` +
                    `reason=${match.reason} | ` +
                    `existing_deposit_id=${match.deposit_list_id} | ` +
                    `matched_on: transaction_id=${transaction_id ?? 'null'} ` +
                    `utr=${utr ?? 'null'} ` +
                    `payment_reference_ids=[${payment_reference_ids.join(', ')}]`,
                );
                return {
                    duplicate_found:      true,
                    reason:               match.reason,
                    existing_deposit_id:  match.deposit_list_id,
                };
            }

            logger.info('checkDuplicateDeposit: no duplicate found');
            return { duplicate_found: false };

        } catch (error) {
            // Safety net: DB error during duplicate check must never block a
            // legitimate deposit.  Log and let the request continue.
            logger.error(
                `checkDuplicateDeposit: error during check — ${error.message}`,
                { stack: error.stack },
            );
            return { duplicate_found: false };
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // FUTURE DASHBOARD METHODS  (stubs — not yet wired to any route)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return deposits flagged as suspicious by the AI.
     * TODO: wire to admin dashboard route when the panel is built.
     *
     * @param {number} limit  Max rows to return (default 50)
     */
    static async getSuspiciousDeposits(limit = 50) {
        return DepositAiAnalysisModel.getSuspiciousDeposits(limit);
    }

    /**
     * Return the current AI review queue (deposits needing human review).
     * TODO: wire to admin dashboard route when the panel is built.
     *
     * @param {number} limit  Max rows to return (default 100)
     */
    static async getReviewQueue(limit = 100) {
        return DepositAiAnalysisModel.getReviewQueue(limit);
    }

    /**
     * Return deposits with fraud_score >= threshold.
     * TODO: wire to admin dashboard route when the panel is built.
     *
     * @param {number} threshold  Minimum fraud score (default 50)
     * @param {number} limit      Max rows to return (default 100)
     */
    static async getHighFraudDeposits(threshold = 50, limit = 100) {
        return DepositAiAnalysisModel.getHighFraudDeposits(threshold, limit);
    }

    /**
     * Return per-template aggregated extraction statistics.
     * TODO: wire to admin dashboard route when the panel is built.
     */
    static async getTemplateStats() {
        return DepositAiAnalysisModel.getTemplateStats();
    }

    /**
     * Return daily AI extraction statistics for the last N days.
     * TODO: wire to admin dashboard route when the panel is built.
     *
     * @param {number} days  Lookback window in days (default 30)
     */
    static async getDailyAiStats(days = 30) {
        return DepositAiAnalysisModel.getDailyAiStats(days);
    }
}

module.exports = DepositAiAnalysisService;
