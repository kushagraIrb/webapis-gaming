const moment = require('moment-timezone');
const model = require('../models/bankAssignmentModel');
const depositModel = require('../models/depositModel');
const { rankAccounts } = require('../utils/bankAssignmentRank');
const { logger } = require('../logger');
const { notifyAdmin } = require('../helpers/notifyAdmin');
const featureModel = require('../models/featureModel');

// The feature key in Admin Area > Feature Launch
// REMOVE after retire: feature bank_assignment. Once it is live for everyone and retired, delete this constant, the
// featureModel import and the isLiveForUser check in assign(), plus the old rotation it falls back to.
const FEATURE_KEY = 'bank_assignment';

// Which admin bank account a user is shown on the deposit page (range -> accounts, plus universal accounts),
// remembered per user, with a "switch account" option. Rules: gamingAdminNode docs / Bank_Assignment_Documentation.
// Everything runs in IST. An assignment is valid 30 minutes from the last visit, never more than 2 hours from the
// start of the visit (both from tbl_ba_setting).

const FMT = 'YYYY-MM-DD HH:mm:ss';
const GRACE_HOURS = 24; // a deposit is still accepted for this long after an account was shown

const istNow = () => moment().tz('Asia/Kolkata');

// per user: the requests of one user run one after the other (see withTransaction)
const userQueues = new Map();
// alert id -> when the admins were last told again (see checkAlert)
const renotified = new Map();

function fail(statusCode, code, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

const parseTried = (s) => (s ? String(s).split(',').map(Number).filter(Boolean) : []);
const triedToText = (list) => (list.length ? [...new Set(list)].join(',') : null);

function parseAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
        throw fail(400, 'INVALID_AMOUNT', 'A valid deposit amount is required');
    }
    return Math.round(amount * 100) / 100;
}

class BankAssignmentService {
    // ── helpers ────────────────────────────────────────────────────────────────

    static clock(settings) {
        const now = istNow();
        return {
            now: now.format(FMT),
            nowMs: now.format('YYYY-MM-DD HH:mm:ss.SSS'),
            today: now.format('YYYY-MM-DD'),
            validUntil: (hardUntil) => {
                const v = now.clone().add(settings.assignment_minutes, 'minutes');
                const cap = moment.tz(hardUntil, FMT, 'Asia/Kolkata');
                return (v.isAfter(cap) ? cap : v).format(FMT);
            },
            newHardUntil: now.clone().add(settings.assignment_max_minutes, 'minutes').format(FMT),
        };
    }

    // Can this assignment's account still be used for this amount? A paused account (day limit reached because of
    // other users) is still fine for a user who already holds it.
    static async accountUsable(conn, bankId, amount) {
        const s = await model.getAccountState(conn, bankId);
        if (!s || s.bankStatus !== 1) return { usable: false, reason: 'DISABLED' };
        if (!s.role) return { usable: false, reason: 'NOT_MANAGED' };
        if (s.role === 'UNIVERSAL') return { usable: true, universal: true };
        if (s.rangeStatus !== 1) return { usable: false, reason: 'RANGE_DISABLED' };
        if (amount < Number(s.minAmount) || amount > Number(s.maxAmount)) return { usable: false, reason: 'RANGE_MISMATCH' };
        return { usable: true, universal: false, rangeId: s.rangeId };
    }

    // Choose a new account for a user. Must run inside a transaction (takes the range lock). `tried` accounts are
    // never chosen again. Returns { bankId, universal } or null when nothing at all is usable.
    static async pickAccount(conn, amount, tried, settings, clock) {
        const range = await model.findRangeForAmount(conn, amount);
        if (range) {
            await model.lockRange(conn, range.id);
            const all = await model.rangeAccounts(conn, range.id, clock.today, clock.now);
            const rangeTotal = all.reduce((s, a) => s + a.dayTotal, 0);
            const usable = all.filter(
                (a) => !tried.includes(a.bankId) && !(a.dailyLimit != null && a.dayTotal >= a.dailyLimit)
            );
            const ranked = rankAccounts(usable, rangeTotal, {
                balancePercent: settings.balance_percent,
                minVolume: settings.min_volume_amount,
            });
            if (ranked.length > 0) return { bankId: ranked[0].bankId, universal: false };
        }
        // no range, or nothing usable left in it: a universal account (the one assigned longest ago)
        await model.lockUniversal(conn);
        const universal = (await model.universalAccounts(conn)).filter((a) => !tried.includes(a.bankId));
        const ranked = rankAccounts(universal, 0, { minVolume: Infinity });
        if (ranked.length > 0) return { bankId: ranked[0].bankId, universal: true };
        return null;
    }

    // Up to N accounts this user was shown before, still usable for this amount (not the current one, not tried)
    static async previousAccounts(conn, userId, currentBankId, amount, tried, settings, clock) {
        const shown = await model.shownBankIds(conn, userId);
        const out = [];
        for (const bankId of shown) {
            if (out.length >= settings.previous_accounts_shown) break;
            if (bankId === currentBankId || tried.includes(bankId)) continue;
            const state = await model.getAccountState(conn, bankId);
            if (!state || state.bankStatus !== 1 || state.role !== 'RANGE' || state.rangeStatus !== 1) continue;
            if (amount < Number(state.minAmount) || amount > Number(state.maxAmount)) continue;
            if (state.dailyLimit != null) {
                const accounts = await model.rangeAccounts(conn, state.rangeId, clock.today, clock.now);
                const mine = accounts.find((a) => a.bankId === bankId);
                if (!mine || mine.dayTotal >= Number(state.dailyLimit)) continue;
            }
            out.push(bankId);
        }
        return out;
    }

    // Build the answer the deposit page needs
    static async describe(conn, userId, assignmentRow, settings, clock, extra = {}) {
        const amount = Number(assignmentRow.amount);
        const tried = parseTried(assignmentRow.tried_bank_ids);
        const bank = await model.getBank(conn, assignmentRow.bank_id);
        const state = await model.getAccountState(conn, assignmentRow.bank_id);
        const universal = Boolean(state && state.role === 'UNIVERSAL');
        const prevIds = universal ? [] : await this.previousAccounts(conn, userId, assignmentRow.bank_id, amount, tried, settings, clock);
        const previous = await model.getBanks(conn, prevIds);
        previous.sort((a, b) => prevIds.indexOf(a.id) - prevIds.indexOf(b.id));
        return {
            assignment_id: assignmentRow.id,
            bank,
            previous,
            is_universal: universal,
            can_switch: !universal,
            valid_until: assignmentRow.valid_until,
            ...extra,
        };
    }

    // One transaction per request. A named lock per user stops the same user (double-click, two tabs) from running
    // two assignments at once; the range lock inside pickAccount stops different users from taking the same last
    // slot. READ COMMITTED so that, after waiting for a lock, the day totals are read fresh (not from an older
    // snapshot) and so that reads take no gap locks (which deadlock under load). Lock order is always
    // user lock -> range lock -> universal rows.
    static async withTransaction(userId, fn) {
        // Requests of the same user queue here first, so one user firing many requests at once cannot fill the
        // connection pool with connections that only wait for the user lock.
        const previous = userQueues.get(userId) || Promise.resolve();
        let release;
        const turn = new Promise((resolve) => { release = resolve; });
        const chained = previous.then(() => turn);
        userQueues.set(userId, chained);
        await previous;
        try {
            return await this.runTransaction(userId, fn);
        } finally {
            release();
            if (userQueues.get(userId) === chained) userQueues.delete(userId);
        }
    }

    static async runTransaction(userId, fn) {
        const conn = await model.getConnection();
        const lockName = `ba_user_${userId}`;
        let locked = false;
        try {
            const [[got]] = await conn.query('SELECT GET_LOCK(?, 10) AS got', [lockName]);
            if (Number(got.got) !== 1) throw fail(503, 'BUSY', 'Please try again in a moment.');
            locked = true;
            await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
            await conn.beginTransaction();
            const result = await fn(conn);
            await conn.commit();
            return result;
        } catch (error) {
            try { await conn.rollback(); } catch (_) { /* connection already gone */ }
            throw error;
        } finally {
            if (locked) { try { await conn.query('SELECT RELEASE_LOCK(?)', [lockName]); } catch (_) { /* released with the connection */ } }
            conn.release();
        }
    }

    // ── Step 1: the user confirmed an amount ───────────────────────────────────

    // Returns { configured: false } while no range is set up, or while the feature has not been launched for this
    // user in Admin Area > Feature Launch (the caller then uses the old rotation).
    static async assign(userId, rawAmount) {
        const amount = parseAmount(rawAmount);
        // REMOVE after retire: feature bank_assignment (this check, and the old rotation it falls back to)
        if (!(await featureModel.isLiveForUser(FEATURE_KEY, userId))) return { configured: false };
        if (!(await model.isConfigured())) return { configured: false };

        const settings = await model.getSettings();
        const clock = this.clock(settings);

        const data = await this.withTransaction(userId, async (conn) => {
            await model.expireStale(conn, userId, clock.now);
            const live = await model.findLiveAssignment(conn, userId, clock.now);
            let carry = { chainId: null, tried: [], hardUntil: clock.newHardUntil };
            let replacedCode = null;

            if (live) {
                const check = await this.accountUsable(conn, live.bank_id, amount);
                const sameAmount = Number(live.amount) === amount;
                const reusable = check.usable && (check.universal ? sameAmount : true);
                if (reusable) {
                    // keep the same account; the amount held moves to the new amount, the visit is extended
                    await model.touchAssignment(conn, live.id, { now: clock.now, validUntil: clock.validUntil(live.hard_until), amount });
                    const row = await model.getAssignment(conn, live.id, userId);
                    return this.describe(conn, userId, row, settings, clock);
                }
                // the account can no longer be used for this user: replace it, keep the visit's tried list
                await model.setAssignmentStatus(conn, live.id, 'REPLACED');
                carry = { chainId: live.chain_id, tried: parseTried(live.tried_bank_ids), hardUntil: live.hard_until };
                replacedCode = check.usable || check.reason === 'RANGE_MISMATCH' ? 'AMOUNT_CHANGED' : 'ACCOUNT_CHANGED';
            }

            const picked = await this.pickAccount(conn, amount, carry.tried, settings, clock);
            if (!picked) throw fail(503, 'NO_ACCOUNT', 'No bank account is available right now. Please contact support.');
            const id = await model.insertAssignment(conn, {
                userId, bankId: picked.bankId, amount, source: picked.universal ? 'UNIVERSAL' : 'AUTO',
                chainId: carry.chainId, tried: triedToText(carry.tried), now: clock.now, nowMs: clock.nowMs,
                validUntil: clock.validUntil(carry.hardUntil), hardUntil: carry.hardUntil,
            });
            const row = await model.getAssignment(conn, id, userId);
            return this.describe(conn, userId, row, settings, clock, replacedCode ? { replaced: replacedCode } : {});
        });
        return { configured: true, ...data };
    }

    // ── Step 2 page loaded with the account ────────────────────────────────────

    static async shown(userId, assignmentId) {
        const settings = await model.getSettings();
        const clock = this.clock(settings);
        return this.withTransaction(userId, async (conn) => {
            const a = await model.getAssignment(conn, assignmentId, userId);
            if (!a || a.status !== 'LIVE' || a.valid_until <= clock.now || a.hard_until <= clock.now) {
                throw fail(409, 'ASSIGNMENT_EXPIRED', 'This bank account is no longer reserved for you. Please start again.');
            }
            await model.markShown(conn, a.id, clock.now, clock.validUntil(a.hard_until));
            return { assignment_id: a.id };
        });
    }

    // ── "Can't pay? Switch account" ────────────────────────────────────────────

    static async switchAccount(userId, assignmentId, rawReason) {
        const settings = await model.getSettings();
        const clock = this.clock(settings);
        const reason = rawReason == null ? null : String(rawReason).trim().slice(0, 500) || null;

        const result = await this.withTransaction(userId, async (conn) => {
            const cur = await model.getAssignment(conn, assignmentId, userId);
            if (!cur || cur.status !== 'LIVE' || cur.valid_until <= clock.now || cur.hard_until <= clock.now) {
                throw fail(409, 'ASSIGNMENT_EXPIRED', 'This bank account is no longer reserved for you. Please start again.');
            }
            const state = await model.getAccountState(conn, cur.bank_id);
            if (state && state.role === 'UNIVERSAL') {
                throw fail(400, 'UNIVERSAL_NO_SWITCH', 'No other account is available. Please contact support.');
            }
            const sinceCreated = moment.tz(clock.now, FMT, 'Asia/Kolkata').diff(moment.tz(cur.created_at, FMT, 'Asia/Kolkata'), 'seconds');
            if (sinceCreated < settings.switch_cooldown_seconds) {
                throw fail(429, 'SWITCH_TOO_FAST', 'Please wait a moment before switching again.');
            }

            const amount = Number(cur.amount);
            await model.insertIssueReport(conn, { userId, bankId: cur.bank_id, assignmentId: cur.id, amount, reason, now: clock.now });

            const tried = [...parseTried(cur.tried_bank_ids), cur.bank_id];
            const picked = await this.pickAccount(conn, amount, tried, settings, clock);
            // nothing else to offer: the report still counts (it is committed), the user keeps what they have and is told
            if (!picked) return { noAccount: true, reported_bank_id: cur.bank_id };
            await model.setAssignmentStatus(conn, cur.id, 'SWITCHED');
            const id = await model.insertAssignment(conn, {
                userId, bankId: picked.bankId, amount, source: picked.universal ? 'UNIVERSAL' : 'SWITCH',
                chainId: cur.chain_id, tried: triedToText(tried), now: clock.now, nowMs: clock.nowMs,
                validUntil: clock.validUntil(cur.hard_until), hardUntil: cur.hard_until,
                shownAt: clock.now,
            });
            const row = await model.getAssignment(conn, id, userId);
            return { reported_bank_id: cur.bank_id, ...(await this.describe(conn, userId, row, settings, clock)) };
        });

        // After the report is saved: does it push the account over the alert threshold? Never fails the switch.
        this.checkAlert(result.reported_bank_id, settings, clock).catch((error) =>
            logger.error(`bankAssignment: alert check failed bank=${result.reported_bank_id}: ${error.message}`, { stack: error.stack })
        );
        if (result.noAccount) throw fail(503, 'NO_ACCOUNT', 'No other bank account is available right now. Please contact support.');
        return result;
    }

    // More than `alert_users` different users reported the same account inside the window (counting only reports made
    // since the last alert of that account was dealt with): open ONE alert and tell the admin panel (live notification).
    static async checkAlert(bankId, settings, clock) {
        const windowStart = moment.tz(clock.now, FMT, 'Asia/Kolkata').subtract(settings.alert_window_minutes, 'minutes').format(FMT);
        const lastResolved = await model.lastResolvedAt(bankId);
        const afterResolved = Boolean(lastResolved && lastResolved >= windowStart);
        const reporters = await model.countReporters(bankId, afterResolved ? lastResolved : windowStart, afterResolved);
        if (reporters <= settings.alert_users) return null;

        let alertId = await model.openAlert(bankId, reporters, clock.now);
        if (!alertId) {
            // already open. Normally the admins were told; if the notification got lost (admin API down) try again
            const open = await model.openAlertNotices(bankId);
            const last = renotified.get(open && open.id) || 0;
            if (!open || open.told > 0 || Date.now() - last < 60000) return null;
            renotified.set(open.id, Date.now());
            alertId = open.id;
        }

        const conn = await model.getConnection();
        let label = `Account ${bankId}`;
        try {
            const bank = await model.getBank(conn, bankId);
            if (bank) {
                const last4 = bank.ac_no ? ` ending ${String(bank.ac_no).slice(-4)}` : '';
                label = `${bank.bank_name || 'Bank'} - ${bank.name || ''}${last4}`.trim();
            }
        } finally {
            conn.release();
        }
        // the live toast carries no reasons (they are on the Alerts screen)
        notifyAdmin('bank_account_alert', { alert_id: alertId, bank_id: bankId, bank_label: label, user_count: reporters });
        return alertId;
    }

    // ── the user picked one of the earlier accounts from the dropdown ─────────

    static async select(userId, assignmentId, bankId) {
        const settings = await model.getSettings();
        const clock = this.clock(settings);
        const wanted = Number(bankId);

        return this.withTransaction(userId, async (conn) => {
            const cur = await model.getAssignment(conn, assignmentId, userId);
            if (!cur || cur.status !== 'LIVE' || cur.valid_until <= clock.now || cur.hard_until <= clock.now) {
                throw fail(409, 'ASSIGNMENT_EXPIRED', 'This bank account is no longer reserved for you. Please start again.');
            }
            const amount = Number(cur.amount);
            const tried = parseTried(cur.tried_bank_ids);
            const allowed = await this.previousAccounts(conn, userId, cur.bank_id, amount, tried, settings, clock);
            if (!allowed.includes(wanted)) {
                throw fail(400, 'ACCOUNT_NOT_AVAILABLE', 'This bank account is not available any more. Please use the account shown.');
            }
            const state = await model.getAccountState(conn, wanted);
            await model.lockRange(conn, state.rangeId);
            if (state.dailyLimit != null) {
                // read again now that we hold the lock: another user may have taken the last room meanwhile
                const accounts = await model.rangeAccounts(conn, state.rangeId, clock.today, clock.now);
                const mine = accounts.find((x) => x.bankId === wanted);
                if (!mine || mine.dayTotal >= Number(state.dailyLimit)) {
                    throw fail(400, 'ACCOUNT_NOT_AVAILABLE', 'This bank account is not available any more. Please use the account shown.');
                }
            }
            await model.setAssignmentStatus(conn, cur.id, 'REPLACED');
            const id = await model.insertAssignment(conn, {
                userId, bankId: wanted, amount, source: 'DROPDOWN',
                chainId: cur.chain_id, tried: triedToText(tried), now: clock.now, nowMs: clock.nowMs,
                validUntil: clock.validUntil(cur.hard_until), hardUntil: cur.hard_until, shownAt: clock.now,
            });
            const row = await model.getAssignment(conn, id, userId);
            return this.describe(conn, userId, row, settings, clock);
        });
    }

    // ── deposit save ───────────────────────────────────────────────────────────

    // Which account does this deposit belong to? Looked at BEFORE the deposit row is written (the holder name comes
    // from the account). Returns null when the feature is not configured or the user has no recent assignment (old
    // app build): the deposit is then saved the old way. A flag marks a deposit made after the account changed.
    static async resolveForSave(userId, assignmentId) {
        if (!(await model.isConfigured())) return null;
        const clock = this.clock(await model.getSettings());
        const conn = await model.getConnection();
        try {
            let a = null;
            if (assignmentId) a = await model.getAssignment(conn, Number(assignmentId), userId);
            if (!a) a = await model.findLiveAssignment(conn, userId, clock.now);
            if (!a) return null;
            const ageHours = moment.tz(clock.now, FMT, 'Asia/Kolkata').diff(moment.tz(a.created_at, FMT, 'Asia/Kolkata'), 'hours', true);
            if (ageHours > GRACE_HOURS) return null;

            const bank = await model.getBank(conn, a.bank_id);
            if (!bank) return null;
            let flagReason = null;
            if (a.status === 'REPLACED') flagReason = 'ACCOUNT_REPLACED';
            else if (a.status === 'SWITCHED') flagReason = 'SWITCHED_AWAY';
            else if (a.status === 'EXPIRED' || (a.status === 'LIVE' && (a.valid_until <= clock.now || a.hard_until <= clock.now))) {
                flagReason = 'ASSIGNMENT_EXPIRED';
            } else if (a.status === 'LIVE') {
                const check = await this.accountUsable(conn, a.bank_id, Number(a.amount));
                if (!check.usable) flagReason = 'ACCOUNT_UNUSABLE';
            }
            return { assignment: a, bank, flagReason };
        } finally {
            conn.release();
        }
    }

    // After the deposit row exists: link it to the account, count it in the day total, close the assignment.
    // A failure here is logged and does not undo the deposit (the wallet is already credited).
    static async recordDeposit(ctx, { userId, depositListId, amount }) {
        if (!ctx) return;
        try {
            const write = () => {
                const now = istNow();
                return this.withTransaction(userId, async (conn) => {
                    await model.recordDepositEntry(conn, {
                        depositListId, userId, bankId: ctx.assignment.bank_id, assignmentId: ctx.assignment.id,
                        amount, entryDate: now.format('YYYY-MM-DD'), flagged: Boolean(ctx.flagReason),
                        flagReason: ctx.flagReason, now: now.format(FMT),
                    });
                    if (ctx.assignment.status === 'LIVE') await model.setAssignmentStatus(conn, ctx.assignment.id, 'SUBMITTED');
                });
            };
            try {
                await write();
            } catch (firstError) {
                // a lock timeout or deadlock is worth one more try before giving up
                await new Promise((resolve) => setTimeout(resolve, 300));
                await write();
            }
        } catch (error) {
            logger.error(
                `bankAssignment: could not record deposit_list_id=${depositListId} user=${userId} bank=${ctx.assignment.bank_id}: ${error.message}`,
                { stack: error.stack }
            );
        }
    }

    // The old rotation, used only while the feature is not configured
    static async legacyAccount(amount) {
        return depositModel.fetchBankAccountByValue(amount);
    }
}

module.exports = BankAssignmentService;
