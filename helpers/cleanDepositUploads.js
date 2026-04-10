const cron = require('node-cron');
const path = require('path');
const deleteOldFiles = require('./deleteOldFiles');

function runCleanup(source = 'CRON') {
    console.log(`[${new Date().toISOString()}] (${source}) Cleaning uploads/deposit`);

    const dirPath = path.join(__dirname, '..', 'uploads', 'deposit');
    deleteOldFiles(dirPath);
}

/**
 * 🔹 MANUAL RUN (Terminal)
 * node helpers/cleanDepositUploads.js
 */
if (require.main === module) {
    runCleanup('MANUAL');
}

/**
 * 🔹 AUTOMATIC RUN (2 AM daily)
 * This will run when the file is required by app.js / PM2
 */
cron.schedule('0 2 * * *', () => {
    runCleanup('CRON');
}, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
});