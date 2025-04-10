const winston = require('winston');
const path = require('path');
const fs = require('fs');

const ERROR_LOG_DIR = path.join(__dirname, 'errors'); // Error logs folder
const INFO_LOG_DIR = path.join(__dirname, 'info'); // Info logs folder
const RETENTION_DAYS = 5; // Keep logs for 5 days

// Ensure log directories exist
if (!fs.existsSync(ERROR_LOG_DIR)) fs.mkdirSync(ERROR_LOG_DIR);
if (!fs.existsSync(INFO_LOG_DIR)) fs.mkdirSync(INFO_LOG_DIR);

// Function to get IST timestamp
const getISTTimestamp = () => {
    const now = new Date();
    const ISTOffset = 5.5 * 60 * 60 * 1000; // IST Offset in milliseconds
    return new Date(now.getTime() + ISTOffset).toISOString().replace('T', ' ').split('.')[0]; // Format: YYYY-MM-DD HH:MM:SS
};

// Create a logger
const logger = winston.createLogger({
    level: 'info', // Default level
    format: winston.format.combine(
        winston.format.timestamp({ format: getISTTimestamp }), // Set IST timestamp
        winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(ERROR_LOG_DIR, `${new Date().toLocaleDateString('en-GB').split('/').reverse().join('-')}.log`),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(INFO_LOG_DIR, `${new Date().toLocaleDateString('en-GB').split('/').reverse().join('-')}.log`),
            level: 'info'
        })
    ]
});

// Function to delete logs older than 5 days
function deleteOldLogs(logDir) {
    fs.readdir(logDir, (err, files) => {
        if (err) {
            console.error(`Error reading log directory (${logDir}):`, err);
            return;
        }

        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(logDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`Error getting file stats (${filePath}):`, err);
                    return;
                }

                const fileAgeInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                if (fileAgeInDays > RETENTION_DAYS) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error(`Error deleting old log file (${filePath}):`, err);
                        } else {
                            console.log(`Deleted old log file: ${file}`);
                        }
                    });
                }
            });
        });
    });
}

// Run cleanup when the server starts
deleteOldLogs(ERROR_LOG_DIR);
deleteOldLogs(INFO_LOG_DIR);

module.exports = { logger, deleteOldLogs };