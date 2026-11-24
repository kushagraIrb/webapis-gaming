const requestIp = require('request-ip');
const { trustedClientIp } = require('./trustedIp');

// The website sits behind Cloudflare, which puts the visitor's real address in CF-Connecting-IP
// and replaces any copy of that header sent by the visitor. It is only trustworthy while the
// server accepts web traffic from Cloudflare alone; otherwise the fallback below is used.
const clean = (value, max) => {
    const text = String(value || '').trim();
    return text ? text.slice(0, max) : null;
};

// The visitor's address for the activity log and for the login block, so both always agree. When it can be
// told for sure (see helpers/trustedIp.js) a faked CF-Connecting-IP is ignored; when it cannot, the old
// best guess is kept so the log still has something.
exports.clientIp = (req) => {
    const { ip, trusted } = trustedClientIp(req);
    if (trusted) {
        return ip;
    }
    if (ip) {
        return ip;
    }
    return (requestIp.getClientIp(req) || '').replace(/^::ffff:/, '').slice(0, 45) || null;
};

// Country always comes with Cloudflare; state and city only when the "Add visitor location
// headers" managed transform is on. Whatever is missing stays null.
exports.clientGeo = (req) => {
    const country = clean(req.headers['cf-ipcountry'], 100);
    return {
        // XX = unknown, T1 = Tor
        country: country && !['XX', 'T1'].includes(country.toUpperCase()) ? country.toUpperCase() : null,
        state: clean(req.headers['cf-region'], 100),
        city: clean(req.headers['cf-ipcity'], 100),
    };
};

exports.clientBrowser = (req) => clean(req.headers['user-agent'], 512);
