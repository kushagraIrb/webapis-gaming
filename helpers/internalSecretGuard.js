// Guards internal-only endpoints called by peer backends (e.g. gamingAdminNode
// calling GamingBackend /api/internal/*). Rejects anything without a matching
// shared secret in the x-internal-secret header. INTERNAL_WEBHOOK_SECRET must
// be set in both services' .env files to the same random value.
module.exports = (req, res, next) => {
    const expected = process.env.INTERNAL_WEBHOOK_SECRET;
    if (!expected) {
        return res.status(500).json({ message: 'Server misconfigured: INTERNAL_WEBHOOK_SECRET missing' });
    }
    const provided = req.headers['x-internal-secret'];
    if (!provided || provided !== expected) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
};
