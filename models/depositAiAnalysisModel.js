const db = require('../config/database');

/**
 * Data-access layer for tbl_deposit_ai_analysis.
 *
 * This table stores the full AI extraction result from Python FastAPI
 * (/extract-image) linked to every row in tbl_deposit_list via
 * deposit_list_id = tbl_deposit_list.id.
 *
 * All mutations are INSERT-only (no UPDATE/DELETE).
 * Dashboard queries are read-only stubs for future admin panel use.
 */
class DepositAiAnalysisModel {

    // ─────────────────────────────────────────────────────────────────────────
    // WRITE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Insert one row into tbl_deposit_ai_analysis.
     *
     * All columns are nullable — a partial AI response is stored as-is so
     * that the deposit row is always persisted even when certain fields are
     * absent from the FastAPI response.
     *
     * @param {object} data  Mapped column values (see DepositAiAnalysisService.saveAiAnalysis)
     * @returns {Promise<object>}  mysql2 result object (includes insertId)
     */
    static async saveAiAnalysis(data) {
        const query = `
            INSERT INTO tbl_deposit_ai_analysis (
                deposit_list_id,
                request_id,
                image_name,
                amount,
                transaction_id,
                utr,
                payment_reference_ids,
                transaction_date,
                transaction_time,
                transaction_status,
                receiver_name,
                payment_app,
                bank_name,
                template_name,
                confidence_score,
                quality,
                fraud_score,
                fraud_flags,
                is_suspicious,
                review_required,
                review_reasons,
                nearest_similarity,
                vector_template_hint,
                ocr_text,
                full_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            data.deposit_list_id      ?? null,
            data.request_id           ?? null,
            data.image_name           ?? null,
            data.amount               ?? null,
            data.transaction_id       ?? null,
            data.utr                  ?? null,
            // JSON column — array of all payment identifiers found (string[])
            data.payment_reference_ids !== undefined ? JSON.stringify(data.payment_reference_ids) : null,
            data.transaction_date     ?? null,
            data.transaction_time     ?? null,
            data.transaction_status   ?? null,
            data.receiver_name        ?? null,
            data.payment_app          ?? null,
            data.bank_name            ?? null,
            data.template_name        ?? null,
            data.confidence_score     ?? null,
            data.quality              ?? null,
            data.fraud_score          ?? null,
            // JSON columns — must be serialised to string for mysql2
            data.fraud_flags     !== undefined ? JSON.stringify(data.fraud_flags)    : null,
            // TINYINT(1) — coerce boolean to 0/1
            data.is_suspicious   !== undefined ? (data.is_suspicious   ? 1 : 0)     : null,
            data.review_required !== undefined ? (data.review_required ? 1 : 0)     : null,
            data.review_reasons  !== undefined ? JSON.stringify(data.review_reasons) : null,
            data.nearest_similarity   ?? null,
            data.vector_template_hint ?? null,
            data.ocr_text             ?? null,
            data.full_response !== undefined ? JSON.stringify(data.full_response)    : null,
        ];

        const [result] = await db.promise().query(query, values);
        return result;
    }


    // ─────────────────────────────────────────────────────────────────────────
    // DUPLICATE DETECTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Search tbl_deposit_ai_analysis for any previously-stored row that shares
     * a payment identifier with the incoming submission.
     *
     * ── Why three separate checks instead of one big OR query ────────────────
     * Checks 1 and 2 operate on VARCHAR columns that have B-tree indexes
     * (idx_transaction_id, idx_utr), making them O(log n) exact-match lookups.
     * Check 3 is a safety-net cross-field query that uses IN() on those same
     * indexed columns plus JSON_CONTAINS() on the payment_reference_ids array
     * (which cannot be B-tree indexed).  Running checks in order means the
     * fast indexed queries short-circuit before the slower JSON scan fires.
     *
     * ── What each check catches ───────────────────────────────────────────────
     * Check 1 (transaction_id_match):
     *   Same transaction ID, same field.  Handles Case 1 (txn_id only) and
     *   Case 3 (both present).  O(log n).
     *
     * Check 2 (utr_match):
     *   Same UTR/RRN, same field.  Handles Case 2 (UTR only) and Case 3.
     *   O(log n).
     *
     * Check 3 (payment_reference_match):
     *   Cross-field safety net — catches Case 4 (different platforms, same
     *   payment).  Scenario: Screenshot A (BHIM) stores
     *     transaction_id = "560603115709754", utr = "652032305474"
     *   Screenshot B (bank app) arrives with
     *     transaction_id = null, utr = null
     *     payment_reference_ids = ["652032305474"]
     *   Checks 1+2 both miss (null inputs).  Check 3 finds "652032305474"
     *   in A's utr column via the IN() clause.
     *   Also covers legacy rows where columns were null but JSON array was set,
     *   and future cases where the same ID arrives under a different label.
     *
     * @param {object}   params
     * @param {string|null} params.transaction_id
     * @param {string|null} params.utr
     * @param {string[]}    params.payment_reference_ids
     *
     * @returns {Promise<{deposit_list_id: number, reason: string}|null>}
     *   null when no duplicate found.
     */
    static async findDuplicateTransaction({ transaction_id, utr, payment_reference_ids }) {

        // ── Check 1: transaction_id direct column match (indexed) ─────────────
        if (transaction_id) {
            const [rows] = await db.promise().query(
                `SELECT deposit_list_id
                 FROM   tbl_deposit_ai_analysis
                 WHERE  transaction_id = ?
                 LIMIT  1`,
                [transaction_id],
            );
            if (rows.length > 0) {
                return { deposit_list_id: rows[0].deposit_list_id, reason: 'transaction_id_match' };
            }
        }

        // ── Check 2: utr direct column match (indexed) ────────────────────────
        if (utr) {
            const [rows] = await db.promise().query(
                `SELECT deposit_list_id
                 FROM   tbl_deposit_ai_analysis
                 WHERE  utr = ?
                 LIMIT  1`,
                [utr],
            );
            if (rows.length > 0) {
                return { deposit_list_id: rows[0].deposit_list_id, reason: 'utr_match' };
            }
        }

        // ── Check 3: cross-field payment_reference_ids match ──────────────────
        // Build a deduplicated list of ALL known identifiers for this submission.
        // Includes transaction_id and utr so we catch cross-field matches:
        //   e.g. incoming ref "652032305474" found as an EXISTING row's *utr*
        //   even though the incoming submission has no explicit utr field.
        const allRefs = [
            ...new Set(
                [transaction_id, utr, ...(payment_reference_ids || [])]
                    .filter(Boolean),
            ),
        ];

        if (allRefs.length > 0) {
            // Part A: check against indexed transaction_id and utr columns using IN()
            //   — catches: any ref appearing as an existing transaction_id or utr
            //   — uses the B-tree indexes, fast even on large tables
            const inPlaceholders = allRefs.map(() => '?').join(', ');
            const [colRows] = await db.promise().query(
                `SELECT deposit_list_id
                 FROM   tbl_deposit_ai_analysis
                 WHERE  transaction_id IN (${inPlaceholders})
                    OR  utr            IN (${inPlaceholders})
                 LIMIT  1`,
                [...allRefs, ...allRefs],
            );
            if (colRows.length > 0) {
                return { deposit_list_id: colRows[0].deposit_list_id, reason: 'payment_reference_match' };
            }

            // Part B: check against stored payment_reference_ids JSON arrays
            //   — catches: any ref appearing inside a previously-stored JSON array
            //   — JSON_CONTAINS() requires full scan; runs only when Part A misses
            //   — each JSON_CONTAINS() call receives a JSON-quoted string literal
            //     e.g. JSON_CONTAINS('["652032305474"]', '"652032305474"') → 1
            const jsonConditions = allRefs.map(() => 'JSON_CONTAINS(payment_reference_ids, ?)').join(' OR ');
            const jsonValues     = allRefs.map(r => JSON.stringify(r));   // '"652032305474"'

            const [jsonRows] = await db.promise().query(
                `SELECT deposit_list_id
                 FROM   tbl_deposit_ai_analysis
                 WHERE  payment_reference_ids IS NOT NULL
                   AND  (${jsonConditions})
                 LIMIT  1`,
                jsonValues,
            );
            if (jsonRows.length > 0) {
                return { deposit_list_id: jsonRows[0].deposit_list_id, reason: 'payment_reference_match' };
            }
        }

        return null;   // no duplicate found
    }


    // ─────────────────────────────────────────────────────────────────────────
    // DASHBOARD QUERY STUBS  (not yet wired to routes — future admin panel)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return rows where is_suspicious = 1, newest first.
     *
     * @param {number} limit  Max rows (default 50)
     */
    static async getSuspiciousDeposits(limit = 50) {
        const query = `
            SELECT   a.*,
                     d.user_id,
                     d.deposit_amount_step1
            FROM     tbl_deposit_ai_analysis a
            JOIN     tbl_deposit_list d ON d.id = a.deposit_list_id
            WHERE    a.is_suspicious = 1
            ORDER BY a.created_at DESC
            LIMIT    ?
        `;
        const [rows] = await db.promise().query(query, [limit]);
        return rows;
    }

    /**
     * Return rows where review_required = 1, newest first.
     *
     * @param {number} limit  Max rows (default 100)
     */
    static async getReviewQueue(limit = 100) {
        const query = `
            SELECT   a.*,
                     d.user_id,
                     d.deposit_amount_step1
            FROM     tbl_deposit_ai_analysis a
            JOIN     tbl_deposit_list d ON d.id = a.deposit_list_id
            WHERE    a.review_required = 1
            ORDER BY a.created_at DESC
            LIMIT    ?
        `;
        const [rows] = await db.promise().query(query, [limit]);
        return rows;
    }

    /**
     * Return rows with fraud_score >= threshold, ordered by score descending.
     *
     * @param {number} threshold  Minimum fraud score (default 50)
     * @param {number} limit      Max rows (default 100)
     */
    static async getHighFraudDeposits(threshold = 50, limit = 100) {
        const query = `
            SELECT   a.*,
                     d.user_id,
                     d.deposit_amount_step1
            FROM     tbl_deposit_ai_analysis a
            JOIN     tbl_deposit_list d ON d.id = a.deposit_list_id
            WHERE    a.fraud_score >= ?
            ORDER BY a.fraud_score DESC, a.created_at DESC
            LIMIT    ?
        `;
        const [rows] = await db.promise().query(query, [threshold, limit]);
        return rows;
    }

    /**
     * Return per-template aggregated extraction statistics.
     */
    static async getTemplateStats() {
        const query = `
            SELECT   template_name,
                     COUNT(*)                        AS total,
                     ROUND(AVG(confidence_score), 4) AS avg_confidence,
                     SUM(review_required)             AS review_count,
                     SUM(is_suspicious)               AS suspicious_count
            FROM     tbl_deposit_ai_analysis
            WHERE    template_name IS NOT NULL
            GROUP BY template_name
            ORDER BY total DESC
        `;
        const [rows] = await db.promise().query(query);
        return rows;
    }

    /**
     * Return daily extraction stats for the last N days.
     *
     * @param {number} days  Lookback window in days (default 30)
     */
    static async getDailyAiStats(days = 30) {
        const query = `
            SELECT   DATE(created_at)                AS date,
                     COUNT(*)                         AS total_extractions,
                     ROUND(AVG(confidence_score), 4)  AS avg_confidence,
                     SUM(CASE WHEN fraud_score >= 50 THEN 1 ELSE 0 END) AS fraud_flagged,
                     SUM(review_required)              AS review_required_count
            FROM     tbl_deposit_ai_analysis
            WHERE    created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `;
        const [rows] = await db.promise().query(query, [days]);
        return rows;
    }
}

module.exports = DepositAiAnalysisModel;
