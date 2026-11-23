// A short, readable browser name for emails, for example "Chrome on Windows", taken from the
// User-Agent header. An unrecognised header shows its first characters instead.
const browserName = (userAgent) => {
    const ua = String(userAgent || '').trim();
    if (!ua) return 'Unknown browser';

    let browser = null;
    if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
    else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
    else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
    else if (/CriOS\/|Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';

    if (!browser) return ua.slice(0, 40);

    let os = null;
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    return os ? `${browser} on ${os}` : browser;
};

module.exports = browserName;
