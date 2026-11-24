const db = require('../config/database');

// When an admin sets a user's password, tbl_registration.must_change_password is set to 1. Until the user
// picks their own password, the API only lets them call change-password, details (so the site knows what
// to show) and logout. Column comes from sql/20261128-must-change-password.sql.
//
// The column may not exist yet when this code is deployed first, so every use goes through columnReady():
// without the column the feature is simply off and nothing else breaks.
let ready = false;
let checkedAt = 0;

async function columnReady() {
    if (ready) return true;
    if (Date.now() - checkedAt < 60 * 1000) return false;
    checkedAt = Date.now();
    try {
        const [rows] = await db.promise().query("SHOW COLUMNS FROM tbl_registration LIKE 'must_change_password'");
        ready = rows.length > 0;
    } catch (error) {
        ready = false;
    }
    return ready;
}

async function isRequired(userId) {
    if (!(await columnReady())) return false;
    const [rows] = await db.promise().query('SELECT must_change_password FROM tbl_registration WHERE id = ?', [userId]);
    return !!(rows[0] && rows[0].must_change_password === 1);
}

// The only calls a user who must change the password may still make.
const ALLOWED_PATH = /^\/api\/users\/(change-password|details|logout)\/?$/;

function isAllowedPath(req) {
    const path = String(req.originalUrl || '').split('?')[0];
    return ALLOWED_PATH.test(path);
}

module.exports = { columnReady, isRequired, isAllowedPath };
