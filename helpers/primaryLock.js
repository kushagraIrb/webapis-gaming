const db = require('../config/database');

// A bank account the user adds while another one is already primary cannot be made primary for 24
// hours (a stolen login could otherwise add its own account and withdraw to it at once). The time it
// becomes allowed is kept in tbl_user_account.primary_allowed_at (database clock); a Super Admin can set
// it to now from the admin panel. Columns come from sql/20261129-primary-account-lock.sql.
//
// The columns may not exist yet when this code is deployed first, so everything goes through
// columnReady(): without them the rule is simply off and nothing else breaks.
const LOCK_HOURS = 24;

let ready = false;
let checkedAt = 0;

async function columnReady() {
    if (ready) return true;
    if (Date.now() - checkedAt < 60 * 1000) return false;
    checkedAt = Date.now();
    try {
        const [rows] = await db.promise().query("SHOW COLUMNS FROM tbl_user_account LIKE 'primary_allowed_at'");
        ready = rows.length > 0;
    } catch (error) {
        ready = false;
    }
    return ready;
}

// "5 hours 10 minutes" from a number of seconds
function waitText(seconds) {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const hours = `${h} hour${h === 1 ? '' : 's'}`;
    const mins = `${m} minute${m === 1 ? '' : 's'}`;
    if (h === 0) return mins;
    return m === 0 ? hours : `${hours} ${mins}`;
}

function lockedError(seconds) {
    const err = new Error(`This account was added recently. For your security it can be made primary after ${waitText(seconds)}.`);
    err.statusCode = 400;
    err.primaryLocked = true;
    return err;
}

module.exports = { LOCK_HOURS, columnReady, waitText, lockedError };
