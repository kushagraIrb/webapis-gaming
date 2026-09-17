const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('../config/database');
const { logger } = require('../logger');

// Cutoff strings are IST-formatted because both tables now store created/
// delivered_at as IST wall-clock. Comparing against server NOW() would skew
// by the DB session TZ offset.
const istSubtract = (amount, unit) =>
    moment().tz('Asia/Kolkata').subtract(amount, unit).format('YYYY-MM-DD HH:mm:ss');

// Two-tier retention:
//   - delivered rows: 1 days (they served their purpose; keep a week for audit)
//   - undelivered rows: 1 days (longer, in case ops wants to investigate
//     why a user never received a toast). Reconnect replay only looks at
//     the last 24h, so anything older is already effectively dead.
const DELIVERED_RETENTION_DAYS = 1;
const UNDELIVERED_RETENTION_DAYS = 1;

async function purgeTable(tableName) {
    const deliveredCutoff = istSubtract(DELIVERED_RETENTION_DAYS, 'days');
    const undeliveredCutoff = istSubtract(UNDELIVERED_RETENTION_DAYS, 'days');
    const [deliveredResult] = await db.promise().query(
        `DELETE FROM ${tableName}
          WHERE is_delivered = 1
            AND delivered_at IS NOT NULL
            AND delivered_at < ?`,
        [deliveredCutoff]
    );
    const [undeliveredResult] = await db.promise().query(
        `DELETE FROM ${tableName}
          WHERE is_delivered = 0
            AND created < ?`,
        [undeliveredCutoff]
    );
    return {
        delivered: deliveredResult.affectedRows,
        undelivered: undeliveredResult.affectedRows,
    };
}

async function runCleanup(source = 'CRON') {
    const start = Date.now();
    // Both toast tables live in the same DB (user + admin backends share it),
    // so one cron on user backend handles both.
    const tables = ['tbl_toast_event', 'tbl_admin_toast_event'];
    for (const table of tables) {
        try {
            const { delivered, undelivered } = await purgeTable(table);
            const ms = Date.now() - start;
            const msg = `(${source}) ${table} cleanup: `
                + `${delivered} delivered (>${DELIVERED_RETENTION_DAYS}d) `
                + `+ ${undelivered} undelivered (>${UNDELIVERED_RETENTION_DAYS}d) `
                + `rows purged (total elapsed ${ms}ms)`;
            console.log(`[${new Date().toISOString()}] ${msg}`);
            if (logger && typeof logger.info === 'function') logger.info(msg);
        } catch (err) {
            const msg = `(${source}) ${table} cleanup FAILED: ${err.message}`;
            console.error(`[${new Date().toISOString()}] ${msg}`);
            if (logger && typeof logger.error === 'function') {
                logger.error(msg, { stack: err.stack });
            }
        }
    }
}

/**
 * 🔹 MANUAL RUN (Terminal)
 *   node helpers/cleanToastEvents.js
 */
if (require.main === module) {
    runCleanup('MANUAL').then(() => process.exit(0));
}

/**
 * 🔹 AUTOMATIC RUN (3 AM IST daily)
 * Offset from cleanTicketUploads (2 AM) so cleanups don't collide.
 */
cron.schedule('0 3 * * *', () => {
    runCleanup('CRON');
}, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
});
