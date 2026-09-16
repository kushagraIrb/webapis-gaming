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
    if (!io) return false;
    const row = await toastEventModel.getById(eventId);
    if (!row || row.user_id !== userId) return false;
    io.to(`user:${userId}`).emit('notify:toast', formatEvent(row));
    return true;
}

module.exports = { emitToUser, emitExistingEvent };
