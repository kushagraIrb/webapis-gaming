// helpers/notifyAdmin.js
//
// Fire-and-forget bridge from user actions to the admin panel's toast
// pipeline. Posts to the admin backend's /api/internal-notify webhook
// which decides who receives the toast (via permission/role queries) and
// emits via its own Socket.IO server.
//
// Never throws — user actions must NOT fail because of an admin
// notification hiccup.

// Default uses 127.0.0.1 (not "localhost") because Node 18+ fetch on
// Windows tries IPv6 ::1 first for "localhost" and fails when the target
// server is bound to IPv4 only.
const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3001';
const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || '';

async function fireWebhook(type, payload) {
    try {
        // Native fetch (Node 18+).
        const res = await fetch(`${ADMIN_BACKEND_URL}/api/internal-notify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': INTERNAL_WEBHOOK_SECRET,
            },
            body: JSON.stringify({ type, payload: payload || {} }),
        });
        if (!res.ok) {
            console.warn(`notifyAdmin webhook non-2xx (type=${type}): ${res.status}`);
        }
    } catch (err) {
        // Admin backend down / network blip — event is not delivered.
        // We choose to lose it rather than persist here, because admin
        // backend owns the recipient logic; a re-fire has to happen there
        // anyway. This is a live-only notification.
        console.warn(`notifyAdmin webhook failed (type=${type}): ${err.message}`);
    }
}

// Fire-and-forget admin notification. Returns immediately.
function notifyAdmin(type, payload = {}) {
    try {
        if (!type) return;
        setImmediate(() => fireWebhook(type, payload));
    } catch (err) {
        console.error(`notifyAdmin error: ${err.message}`);
    }
}

module.exports = { notifyAdmin };
