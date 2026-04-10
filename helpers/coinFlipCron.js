const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const SERVER_URL = process.env.SERVER_URL;

if (!SERVER_URL) {
  console.error('SERVER_URL is not defined in .env');
  process.exit(1);
}

cron.schedule('*/30 * * * * *', async () => {
  const url = `${SERVER_URL}/api/coin-flip/create-winner`;

  console.log(`[${new Date().toISOString()}] Triggering ${url}...`);

  try {
    const res = await axios.post(
      url,
      null,
      {
        headers: {
          'x-auth-token': process.env.COINFLIP_SECRET_KEY
        }
      }
    );

    console.log('Success:', res.data);
  } catch (error) {
    console.error(
      'Error hitting /create-winner:',
      error.response?.data || error.message
    );
  }
});