const fs = require('fs');
const path = require('path');
const util = require('util');
const moment = require('moment');

const LOG_FILE = path.join(__dirname, '../info/coinflip.log');

// Ensure logs folder exists
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

function writeLog(message) {
  fs.appendFileSync(LOG_FILE, message + '\n', 'utf8');
}

// 🔥 Call this at start of every cron
function startCronLog() {
  const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

  const separator = `
==================================================
🚀 CRON START (IST): ${istTime}
==================================================
`;

  writeLog(separator);
}

async function logQuery(label, query, params, executeFn) {
  const start = Date.now();

  writeLog(`\n🟡 [START] ${label}`);
  writeLog(`Query: ${query.trim()}`);
  writeLog(`Params: ${util.inspect(params, { depth: 1 })}`);

  try {
    const result = await executeFn();

    const duration = Date.now() - start;

    writeLog(`🟢 [END] ${label} (${duration} ms)`);

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    writeLog(`🔴 [ERROR] ${label} (${duration} ms)`);
    writeLog(`Error: ${error.message}`);

    throw error;
  }
}

module.exports = { logQuery, startCronLog };