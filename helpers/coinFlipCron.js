const axios = require('axios');
const perfHooks = require('perf_hooks');
require('dotenv').config();

const SERVER_URL = process.env.SERVER_URL;

if (!SERVER_URL) {
  console.error('SERVER_URL is not defined in .env');
  process.exit(1);
}

// Calls /create-winner every 30 seconds.
//
// This used to be node-cron's '*/30 * * * * *'. node-cron works out its next run from the
// server's local calendar time, and when the UK clocks went back on 25 Oct 2026 (the hour
// 01:00-02:00 UTC happened twice) it believed it was an hour behind: for that hour it fired
// the job over and over instead of every 30 seconds, and at 02:00 UTC it locked the whole
// process in an endless loop. A plain interval only counts elapsed time, so clock changes
// cannot affect it.
const INTERVAL_MS = 30 * 1000;
// Shorter than the interval, so a hung call can never run into the next tick.
const REQUEST_TIMEOUT_MS = 25 * 1000;
// A call still unfinished this long after it started has outlived its own timeout, so it is
// stuck: stop waiting for it rather than let it hold up every later tick.
const STUCK_AFTER_MS = REQUEST_TIMEOUT_MS + 10 * 1000;

let running = false;
let startedAt = 0;
let callId = 0;

// Elapsed time is measured on the monotonic clock, not Date.now(), so a change of the
// server's clock (daylight saving, NTP) can never make a call look older or newer than it is.
const monotonicMs = () => perfHooks.performance.now();

async function trigger() {
  // Calls must never pile up: if the previous one has not finished, skip this tick --
  // unless it is stuck, because the game must get a new match every 30 seconds.
  if (running) {
    if (monotonicMs() - startedAt < STUCK_AFTER_MS) {
      console.warn(`[${new Date().toISOString()}] Previous /create-winner call is still running, skipping this tick`);
      return;
    }
    console.warn(`[${new Date().toISOString()}] Previous /create-winner call has been running for ${Math.round((monotonicMs() - startedAt) / 1000)}s, treating it as stuck and carrying on`);
  }
  running = true;
  startedAt = monotonicMs();
  const thisCall = ++callId;

  const url = `${SERVER_URL}/api/coin-flip/create-winner`;

  console.log(`[${new Date().toISOString()}] Triggering ${url}...`);

  try {
    const res = await axios.post(
      url,
      null,
      {
        headers: {
          'x-auth-token': process.env.COINFLIP_SECRET_KEY
        },
        timeout: REQUEST_TIMEOUT_MS
      }
    );

    console.log('Success:', res.data);
  } catch (error) {
    console.error(
      'Error hitting /create-winner:',
      error.response?.data || error.message
    );
  } finally {
    // A stuck call that finally returns must not mark a newer call as finished.
    if (thisCall === callId) running = false;
  }
}

setInterval(trigger, INTERVAL_MS);
