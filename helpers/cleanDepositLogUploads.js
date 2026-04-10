const cron = require('node-cron');
const path = require('path');
const deleteOldFiles = require('./deleteOldFiles');

function runCleanup() {
    console.log(`[${new Date().toISOString()}] Cleaning uploads/deposit_log`);
    const dirPath = path.join(__dirname, '..', 'uploads', 'deposit_log');
    deleteOldFiles(dirPath);
}

/**
 * Manual run (CMD)
 */
if (require.main === module) {
    runCleanup();
}

/**
 * Automatic daily run (2 AM)
 */
cron.schedule('0 2 * * *', runCleanup, {
    timezone: 'Asia/Kolkata'
});