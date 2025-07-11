const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

cron.schedule('*/30 * * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Triggering /create-winner...`);
  
  try {
    const res = await axios.post('https://node.development-review.net/api/coin-flip/create-winner', null, {
        headers: {
            'x-auth-token': process.env.COINFLIP_SECRET_KEY
        }
    });
    console.log('Success:', res.data);
  } catch (error) {
    console.error('Error hitting /create-winner:', error.message);
  }
});