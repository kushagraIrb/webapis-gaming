const { logger } = require('../logger');
const { emitExistingEvent } = require('../sockets/emitToUser');

class InternalController {
    async notify(req, res) {
        try {
            const { user_id, event_id } = req.body || {};
            const userId = Number(user_id);
            const eventId = Number(event_id);
            if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(eventId) || eventId <= 0) {
                return res.status(400).json({ message: 'user_id and event_id (positive integers) required' });
            }

            const emitted = await emitExistingEvent(eventId, userId);
            // 200 either way: if the user is offline the row stays queued and
            // replay handles it on reconnect. The webhook is best-effort delivery.
            return res.status(200).json({ ok: true, emitted });
        } catch (err) {
            logger.error(`Internal notify failed: ${err.message}`, { stack: err.stack });
            return res.status(500).json({ message: err.message });
        }
    }
}

module.exports = new InternalController();
