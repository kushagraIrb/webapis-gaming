const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/cluster-adapter');
const jwt = require('jsonwebtoken');
const util = require('util');
const db = require('../config/database');
const toastEventModel = require('../models/toastEventModel');
const { logger } = require('../logger');

const query = util.promisify(db.query).bind(db);

let io = null;

function formatEvent(row) {
    let payload = {};
    try {
        payload = row.payload
            ? (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload)
            : {};
    } catch (_) {
        payload = {};
    }
    return { id: row.id, type: row.type, payload, created: row.created };
}

function setupSocketServer(httpServer) {
    io = new Server(httpServer, {
        cors: { origin: true, credentials: true },
        // WebSocket-only avoids the sticky-session requirement under Node cluster.
        // The initial HTTP upgrade lands on any worker; once upgraded, the TCP
        // socket stays on that worker and cross-worker emits go via the cluster
        // adapter's IPC. If we ever need long-polling fallback, add @socket.io/sticky.
        transports: ['websocket'],
        // Cross-worker emit fan-out (uses Node cluster IPC, no Redis needed).
        adapter: createAdapter(),
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth && socket.handshake.auth.token;
            if (!token) {
                console.warn('[toast-debug] user handshake: no token');
                return next(new Error('unauthorized'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Mirror HTTP authToken checks so a socket can't outlive a session
            // that was invalidated by password change, block, or single-device rotation.
            const rows = await query(
                'SELECT id, is_verified, status, ip_status, session_token FROM tbl_registration WHERE id = ?',
                [decoded.id]
            );
            if (!rows.length) {
                console.warn(`[toast-debug] user handshake: user ${decoded.id} not found`);
                return next(new Error('user_not_found'));
            }
            const user = rows[0];
            if (user.session_token !== token) {
                console.warn(`[toast-debug] user handshake: session_token mismatch for user ${decoded.id}`);
                return next(new Error('session_expired'));
            }
            if (user.is_verified !== 1 || user.status !== 1 || user.ip_status !== 1) {
                console.warn(`[toast-debug] user handshake: user ${decoded.id} blocked (verified=${user.is_verified} status=${user.status} ip_status=${user.ip_status})`);
                return next(new Error('blocked'));
            }

            socket.data.userId = decoded.id;
            next();
        } catch (err) {
            console.warn(`[toast-debug] user handshake FAILED: ${err.message}`);
            next(new Error('invalid_token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.data.userId;
        socket.join(`user:${userId}`);
        console.log(`[toast-debug] user ${userId} connected socket=${socket.id} joined room user:${userId}`);
        socket.on('disconnect', (reason) => {
            console.log(`[toast-debug] user ${userId} disconnected socket=${socket.id} reason=${reason}`);
        });

        // Replay pending events from the last 24h. Client-side sessionStorage
        // dedupes so re-shown ids don't produce duplicate toasts on flaky ACKs.
        try {
            const pending = await toastEventModel.listPending(userId, 24);
            for (const evt of pending) {
                socket.emit('notify:toast', formatEvent(evt));
            }
        } catch (err) {
            logger.error(`Replay failed for user ${userId}: ${err.message}`, { stack: err.stack });
        }

        socket.on('notify:ack', async (eventId) => {
            const id = Number(eventId);
            if (!Number.isInteger(id) || id <= 0) return;
            try {
                await toastEventModel.markDelivered(id, userId);
            } catch (err) {
                logger.error(`ACK mark-delivered failed for event ${id}: ${err.message}`);
            }
        });
    });

    return io;
}

function getIo() {
    return io;
}

module.exports = { setupSocketServer, getIo, formatEvent };
