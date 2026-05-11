const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const SERVER_URL = process.env.SERVER_URL;

if (!SERVER_URL) {
  console.error('SRVER_URL is not defined in .env');
  process.exit(1);
}

const url = `${SERVER_URL}/api/deposit/bank-system-reset`;

cron.schedule('0 0 * * *', async () => {

  console.log("====================================");
  console.log("BANK SYSTEM RESET TRIGGERED");
  console.log("TIME:", new Date().toISOString());
  console.log("URL:", url);
  console.log("====================================");

  try {
    const res = await axios.post(
      url,
      null,
      {
        headers: {
          'x-auth-token': process.env.BANK_SYSTEM_RESET_SECRET_KEY
        },
        timeout: 30000
      }
    );

    console.log("Success:", res.data);

  } catch (error) {
    console.error(
      "Error hitting /deposit/bank-system/reset:",
      error.response?.data || error.message
    );
  }
});