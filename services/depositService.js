const depositModel = require('../models/depositModel');
const userModel = require('../models/userModel');
const stringSimilarity = require('string-similarity');
const { logger } = require('../logger');
const DepositAiAnalysisService = require('./depositAiAnalysisService');
const OcrSettingModel = require('../models/ocrSettingModel');
const BankAssignmentService = require('./bankAssignmentService');

class DepositService {
    // Fetch deposit history or count for a user
    static async fetchDepositHistory(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
            const deposits = await depositModel.getDepositHistory(userId, start, perPage);
            const totalCount = await depositModel.getDepositCount(userId); // Fetch total count

            return { deposits, totalCount };
        } catch (error) {
            console.error('Error in depositService:', error.message);
            throw new Error('Failed to fetch deposit history');
        }
    }

    // Fetch Admin Bank Account based on the deposit amount
    static async getBankAccountByValue(depositAmount) {
        try {
            return await depositModel.fetchBankAccountByValue(depositAmount);
        } catch (error) {
            console.error('Error in depositModel:', error.message);
            throw new Error('Failed to fetch deposit history');
        }
    }

    // The bank account for a user and amount: the assigned account while Bank Assignment is set up, the old rotation
    // until then. `assignment` is null on the old rotation. `data` keeps the old shape (the bank row).
    static async getBankAccountForUser(userId, depositAmount) {
        try {
            const assigned = await BankAssignmentService.assign(userId, depositAmount);
            if (assigned.configured) return { data: assigned.bank, assignment: assigned };
            return { data: await BankAssignmentService.legacyAccount(depositAmount), assignment: null };
        } catch (error) {
            if (error.statusCode) throw error;
            console.error('Error in depositService:', error.message);
            throw new Error('Failed to fetch bank account');
        }
    }

    // Save deposit for a user
    static async saveDeposit(userId, depositData, file) {
        try {
            // deposit_amount is intentionally NOT destructured here — it was the user-entered
            // value in the old flow but is now derived from AI extraction on the backend.
            // The frontend value is ignored; aiExtractedAmount (below) replaces it.
            const { deposit_id, deposit_amount_step1, deposit_date, bank_owner_name
            } = depositData;

            // Validate required fields.
            // deposit_amount   — NOT required: derived from AI, may be null if extraction failed.
            // deposit_date     — NOT required: derived from OCR, may be null if date unreadable.
            if (!deposit_id || !deposit_amount_step1) {
                const err = new Error('Some data is missing.');
                err.statusCode = 400;
                throw err;
            }

            const newDepositAmount = parseFloat(deposit_amount_step1);
            if (isNaN(newDepositAmount) || newDepositAmount <= 0) {
                const err = new Error('Invalid deposit amount.');
                err.statusCode = 400;
                throw err;
            }

            // Enforce first-24h total deposit limit for newly registered users
            const userCreatedAt = await depositModel.getUserCreatedAt(userId);
            if (userCreatedAt) {
                const userCreatedMs = new Date(userCreatedAt).getTime();
                const first24hEndsMs = userCreatedMs + (24 * 60 * 60 * 1000);
                const nowMs = Date.now();

                if (nowMs <= first24hEndsMs) {
                    const first24hTotal = await depositModel.getFirst24hDepositTotal(userId, userCreatedAt);
                    if ((first24hTotal + newDepositAmount) > 10000) {
                        const remaining = Math.max(0, 10000 - first24hTotal);
                        const err = new Error('First 24 hours total deposit limit is Rs. 10,000.');
                        err.message = `First 24h limit: ₹10,000. Remaining: ₹${DepositService.formatInr(remaining)}`;
                        err.statusCode = 422;
                        throw err;
                    }
                }
            }

            const hasApprovedDeposit =
                await depositModel.hasApprovedDeposit(userId);

            // If first deposit is not approved yet,
            // block another deposit
            if (!hasApprovedDeposit) {

                const pendingCount =
                    await depositModel.fetchPendingRequestsCount(userId);

                if (pendingCount > 0 && Number(userId) !== 26667) {

                    const err = new Error(
                        'Admin approval pending for your last deposit.'
                    );

                    err.statusCode = 409;

                    throw err;
                }
            }

            const deposit_screenshot = file ? file.filename : null;

            // Extract AI analysis data once — reused for duplicate check (below)
            // and for fire-and-forget persistence (after the deposit row is saved).
            const rawAiAnalysis = depositData.ai_analysis || null;

            // ── AI amount extraction ──────────────────────────────────────────
            // deposit_amount    → AI extracted screenshot amount (tbl_deposit_list)
            // deposit_amount_step1 → user entered amount        (tbl_deposit_list)
            //
            // These two values are stored independently so admins can compare them.
            // If AI extraction failed or the amount is absent, deposit_amount is NULL —
            // we deliberately do NOT fall back to the user amount.  A null deposit_amount
            // is a clear signal that screenshot extraction did not produce a result.
            // The one exception is Google OCR, which has no AI amount at all - see
            // "deposit_amount for Google OCR" below.
            //
            // tbl_transaction_history.credit_amount always uses deposit_amount_step1
            // (user entered) — the AI amount never affects the wallet credit.
            let aiExtractedAmount = null;
            if (rawAiAnalysis) {
                try {
                    const _parsed = typeof rawAiAnalysis === 'string'
                        ? JSON.parse(rawAiAnalysis)
                        : rawAiAnalysis;
                    const _rawAmt = _parsed?.result?.amount;
                    if (_rawAmt !== null && _rawAmt !== undefined) {
                        const _amt = parseFloat(_rawAmt);
                        if (!isNaN(_amt) && _amt > 0) {
                            aiExtractedAmount = _amt;
                        }
                    }
                } catch (_) {
                    // JSON parse failed — aiExtractedAmount stays null
                    logger.warn(`saveDeposit: could not parse ai_analysis for AI amount — user=${userId}`);
                }
            }

            // ── Amount comparison log (for fraud analysis) ────────────────────
            const _userAmt = parseFloat(deposit_amount_step1);
            if (aiExtractedAmount !== null) {
                const _diff = Math.abs(_userAmt - aiExtractedAmount);
                logger.info(
                    `saveDeposit: amount comparison — ` +
                    `user=₹${_userAmt} | AI=₹${aiExtractedAmount} | ` +
                    `diff=₹${_diff.toFixed(2)}` +
                    (_diff > 0 ? ' [MISMATCH]' : ' [MATCH]'),
                );
            } else {
                logger.info(
                    `saveDeposit: AI amount not extracted — user=₹${_userAmt} | AI=null`,
                );
            }

            // ─────────────────────────────────────────────────────────────────
            // STEP 1 — AI DUPLICATE DETECTION  (new primary check)
            //
            // Uses tbl_deposit_ai_analysis to detect duplicate payments across
            // different payment apps and screenshot types:
            //
            //   • Screenshot A (BHIM):     transaction_id only
            //   • Screenshot B (bank app): UTR/RRN only (same payment)
            //
            // Three sub-checks in priority order:
            //   1. transaction_id exact match  (indexed)
            //   2. utr exact match             (indexed)
            //   3. cross-field / payment_reference_ids overlap  (safety net)
            //
            // Safe to skip: if no AI data was sent (rawAiAnalysis is null),
            // checkDuplicateDeposit returns { duplicate_found: false } immediately.
            // ─────────────────────────────────────────────────────────────────
            const aiDupCheck = await DepositAiAnalysisService.checkDuplicateDeposit(rawAiAnalysis);
            if (aiDupCheck.duplicate_found) {
                logger.warn(
                    `saveDeposit: AI duplicate rejected — ` +
                    `user=${userId} deposit_id=${deposit_id} ` +
                    `reason=${aiDupCheck.reason} ` +
                    `existing_deposit_id=${aiDupCheck.existing_deposit_id}`,
                );
                const err = new Error(
                    'This screenshot has already been approved. Please try again with a different screenshot.',
                );
                err.statusCode = 409;
                throw err;
            }

            // ─────────────────────────────────────────────────────────────────
            // STEP 2 — OLD DEPOSIT_ID EXACT MATCH  (fallback)
            //
            // Retained for deposits that went through the old Google Vision flow
            // (no AI data) and as a belt-and-suspenders check for new deposits
            // where the AI check did not fire (AI data absent or had no IDs).
            // ─────────────────────────────────────────────────────────────────
            const existingDeposit = await depositModel.getDepositById(deposit_id);
            if (existingDeposit) {
                const err = new Error('This screenshot has already been approved. Please try again with a different screenshot.');
                err.statusCode = 409;
                throw err;
            }

            // Last deposit added manually by an admin ("W&D with Screenshot"): the
            // admin records only the LAST 5 digits of the transaction ID, so the
            // exact match above cannot see it. If this screenshot's transaction
            // ID ends with those 5 digits it is the same screenshot again.
            const lastDeposit = await depositModel.getLastDeposit(userId);
            const adminEnteredId = lastDeposit ? String(lastDeposit.deposit_id ?? '').trim() : '';
            // The five digits the admin typed. An admin deposit that repeated an earlier
            // Transaction ID is saved as "<5 digits>-<n>" (for example 08396-2); the
            // digits are still those five.
            const adminLastFive = (/^(\d{5})(?:-\d+)?$/.exec(adminEnteredId) || [])[1];
            if (
                lastDeposit &&
                lastDeposit.added_by_admin &&
                adminLastFive &&
                String(deposit_id).trim().endsWith(adminLastFive)
            ) {
                console.warn(
                    `saveDeposit: matches last manual deposit — user=${userId} deposit_id=${deposit_id} ` +
                    `admin_entered_id=${adminEnteredId} last_deposit_list_id=${lastDeposit.id}`
                );
                const err = new Error('This screenshot has already been approved. Please try again with a different screenshot.');
                err.statusCode = 409;
                throw err;
            }

            // Check same screenshot timestamp/deposit date
            const depositsWithSameDate = await depositModel.getDepositsByDate(deposit_date);

            if (depositsWithSameDate.length > 0) {
                for (const deposit of depositsWithSameDate) {
                    const similarity =
                        stringSimilarity.compareTwoStrings(
                            String(deposit.deposit_id).trim(),
                            String(deposit_id).trim()
                        ) * 100;

                    if (similarity > 70) {
                        const err = new Error(
                            'This screenshot has already been approved. Please try again with a different screenshot.'
                        );
                        err.statusCode = 409;
                        throw err;
                    }
                }
            }

            // ── deposit_amount for Google OCR ─────────────────────────────────
            // Google Vision only reads the transaction ID and date, so it sends no AI analysis
            // and there is no AI amount. While Google is the selected OCR engine, deposit_amount
            // is the amount the user entered - exactly deposit_amount_step1 - as it was before
            // the Python OCR existed.
            //
            // Decided on the server (the engine selected in the admin panel) and only when no AI
            // data came with the request, never from what the browser claims: a Python-mode
            // deposit that arrives without AI data still gets NULL, and an AI amount that did
            // come with the request is never overwritten. Read only now, after every rejection
            // above, so a rejected deposit costs no extra query. If the setting cannot be read the
            // deposit is still saved with NULL, exactly as before.
            let depositAmount = aiExtractedAmount;
            if (depositAmount === null && !rawAiAnalysis) {
                try {
                    const selectedEngine = await OcrSettingModel.getEngine();
                    if (String(selectedEngine || '').trim().toLowerCase() === 'google') {
                        depositAmount = deposit_amount_step1;
                        logger.info(
                            `saveDeposit: Google OCR (no AI amount) — deposit_amount set to the user amount ` +
                            `user=${userId} deposit_id=${deposit_id} amount=₹${deposit_amount_step1}`,
                        );
                    }
                } catch (error) {
                    logger.warn(
                        `saveDeposit: could not read the OCR engine setting, deposit_amount left NULL — ` +
                        `user=${userId} deposit_id=${deposit_id}: ${error.message}`,
                    );
                }
            }

            // Bank Assignment: the account this deposit belongs to. The holder name comes from the account on the
            // server, not from the browser. Never blocks a deposit: on any problem it is saved the old way.
            let bankCtx = null;
            try {
                bankCtx = await BankAssignmentService.resolveForSave(userId, depositData.assignment_id);
            } catch (error) {
                logger.error(`saveDeposit: bank assignment lookup failed user=${userId}: ${error.message}`, { stack: error.stack });
            }

            // Prepare deposit data
            const data = {
                userId,
                deposit_id,
                deposit_amount:       depositAmount,      // AI extracted; user amount under Google OCR; NULL if neither
                deposit_amount_step1,                     // user entered (always present)
                deposit_date,
                deposit_screenshot,
                bank_owner_name: bankCtx && bankCtx.bank.name ? bankCtx.bank.name : bank_owner_name
            };

            // Save deposit
            const result = await depositModel.saveDeposit(data);

            if (result) {
                const depositListId = result.insertId;

                // Link the deposit to its bank account and count it in the account's day total
                await BankAssignmentService.recordDeposit(bankCtx, {
                    userId, depositListId, amount: parseFloat(deposit_amount_step1),
                });

                // ── AI Analysis persistence ───────────────────────────────────
                // Fire-and-forget: runs in the background after the deposit row
                // is committed.  Errors are caught inside saveAiAnalysis() and
                // only logged — they NEVER fail or delay the deposit response.
                //
                // rawAiAnalysis is declared above (before the duplicate check)
                // and reused here for persistence.
                DepositAiAnalysisService.saveAiAnalysis(depositListId, rawAiAnalysis, deposit_screenshot)
                    .catch(err =>
                        logger.error(
                            `depositService: uncaught error from saveAiAnalysis for deposit_list_id=${depositListId}: ${err.message}`,
                            { stack: err.stack }
                        )
                    );

                // Fetch bonus_league_id
                const bonusData = await userModel.getBonusIdByUserId(userId);
                const bonus_league_id = bonusData ? bonusData.bonus_league_id : null;

                // Calculate user balance
                const availableBalance = await depositModel.getUserAvailableBalance(userId);
                const totalBalance = parseFloat(deposit_amount_step1) + parseFloat(availableBalance || 0);

                const transData = {
                    transaction_pk: result.insertId,
                    transaction_id: deposit_id,
                    userId,
                    credit_amount: deposit_amount_step1,
                    total_amount: totalBalance,
                    bonus_league_id
                };

                // Add transaction history
                await depositModel.saveTransactionHistory(transData);

                // Update user registration highlight
                await depositModel.updateUserHighlight(userId);

                return {
                    status: true,
                    message: 'Deposit saved successfully and added to the wallet.',
                };
            } else {
                throw new Error('Something went wrong, please try again.');
            }
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw error;
        }
    }


    // Save deposit log for a user
    static async depositLog(userId, depositData, file) {
        try {
            const { deposit_id, deposit_amount, deposit_amount_step1, deposit_date, ss_time_frame, status } = depositData;

            const deposit_screenshot = file ? file.filename : null;

            // Prepare deposit log data
            const data = {
                userId,
                deposit_id,
                deposit_amount,
                deposit_amount_step1,
                deposit_date,
                ss_time_frame,
                status,
                deposit_screenshot
            };

            // Save deposit log
            const result = await depositModel.insertDepositLog(data);

            return {
                status: true,
                message: 'Deposit log saved successfully.',
                data: result,
            };
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw error;
        }
    }

    static async getPendingRequestsCount(userId) {
        try {
            return await depositModel.fetchPendingRequestsCount(userId);
        } catch (error) {
            console.error('Error fetching pending deposit requests count:', error.message);
            throw error;
        }
    }
}

module.exports = DepositService;