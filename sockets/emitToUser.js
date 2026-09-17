const toastEventModel = require('../models/toastEventModel');
const { getIo, formatEvent } = require('./socketServer');
const { logger } = require('../logger');

// Preferred entry point for any code inside GamingBackend that wants to
// push a toast to a user: persists first (durable), then emits if the
// user is online. Returns the inserted event id.
async function emitToUser(userId, type, payload = {}) {
    const eventId = await toastEventModel.insert(userId, type, payload);
    const io = getIo();
    if (io) {
        io.to(`user:${userId}`).emit('notify:toast', {
            id: eventId,
            type,
            payload,
            created: new Date().toISOString(),
        });
    } else {
        logger.warn(`emitToUser: io not ready, event ${eventId} queued for user ${userId}`);
    }
    return eventId;
}

// Used by the /internal/notify webhook path: the row was already written
// by the admin backend, so we just look it up and emit. If the user is
// offline the row sits with is_delivered=0 and reconnect replay picks it up.
async function emitExistingEvent(eventId, userId) {
    const io = getIo();
    if (!io) {
        console.warn(`[toast-debug] emitExistingEvent: io not ready (event=${eventId} user=${userId})`);
        return false;
    }
    const row = await toastEventModel.getById(eventId);
    if (!row) {
        console.warn(`[toast-debug] emitExistingEvent: row ${eventId} not found`);
        return false;
    }
    if (row.user_id !== userId) {
        console.warn(`[toast-debug] emitExistingEvent: user_id mismatch row.user_id=${row.user_id} expected=${userId}`);
        return false;
    }
    const room = `user:${userId}`;
    try {
        const roomSockets = await io.in(room).fetchSockets();
        console.log(`[toast-debug] emit room=${room} event=${eventId} sockets in room=${roomSockets.length}`);
    } catch (_) { /* ignore */ }
    io.to(room).emit('notify:toast', formatEvent(row));
    return true;
}

module.exports = { emitToUser, emitExistingEvent };
