const net = require('net');

// The visitor's IP address, and whether it can be trusted.
//
// The website sits behind Cloudflare, which puts the visitor's address in CF-Connecting-IP. That header
// is only believable when the connection really came from Cloudflare: the server also answers direct
// requests, and anyone can write any value into the header on those. So:
//
//   * the connection comes from a Cloudflare address  -> the visitor is CF-Connecting-IP (trusted)
//   * the connection comes from any other public address -> the visitor is that address (trusted)
//   * the connection address cannot be established, or it is a Cloudflare address with no header
//     -> the best guess is returned, but it is NOT trusted and must never be blocked on.
//
// The connection address is the socket's. When the API sits behind a reverse proxy on the same machine the
// socket is the proxy, so the address the proxy saw is read from X-Real-IP (which the proxy sets itself).
//
// Cloudflare's published ranges: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
// (copied 24 Nov 2026; they change rarely, check them now and then).
const CLOUDFLARE = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
];
const PRIVATE = [
    '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '0.0.0.0/8',
    '::1/128', 'fc00::/7', 'fe80::/10', '::/128',
];

const toList = (ranges) => {
    const list = new net.BlockList();
    for (const range of ranges) {
        const [address, prefix] = range.split('/');
        list.addSubnet(address, Number(prefix), address.includes(':') ? 'ipv6' : 'ipv4');
    }
    return list;
};
const cloudflare = toList(CLOUDFLARE);
const privateRanges = toList(PRIVATE);

const normalize = (value) => String(value || '').trim().replace(/^::ffff:/i, '').slice(0, 45);
const family = (ip) => (net.isIPv6(ip) ? 'ipv6' : 'ipv4');
const isCloudflare = (ip) => net.isIP(ip) !== 0 && cloudflare.check(ip, family(ip));
const isPrivate = (ip) => net.isIP(ip) !== 0 && privateRanges.check(ip, family(ip));
const isPublic = (ip) => net.isIP(ip) !== 0 && !isPrivate(ip);

// The address the connection came from, or null when it cannot be told.
function connectionAddress(req) {
    const socketIp = normalize(req.socket && req.socket.remoteAddress);
    if (isPublic(socketIp)) return socketIp;
    const viaProxy = normalize(req.headers && req.headers['x-real-ip']);
    return isPublic(viaProxy) ? viaProxy : null;
}

// { ip, trusted }: ip may be null; trusted is true only when the address cannot have been faked.
function trustedClientIp(req) {
    const peer = connectionAddress(req);
    const cfHeader = normalize(req.headers && req.headers['cf-connecting-ip']);

    if (peer && isCloudflare(peer)) {
        return net.isIP(cfHeader) ? { ip: cfHeader, trusted: true } : { ip: null, trusted: false };
    }
    if (peer) {
        return { ip: peer, trusted: true };
    }
    // Nothing reliable: keep the old best guess for the log only.
    return { ip: net.isIP(cfHeader) ? cfHeader : null, trusted: false };
}

module.exports = { trustedClientIp, isCloudflare, isPrivate, connectionAddress };
