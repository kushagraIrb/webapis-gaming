const fs = require('fs');
const { Reader } = require('@maxmind/geoip2-node');

// Looks an IP up in the MaxMind GeoLite2-City file. The file is a local download (see
// scripts/update-geolite.sh), so a lookup makes no network call. If the file is missing or the
// address is unknown the result is simply empty and logging carries on without it.
const DB_PATH = process.env.GEOIP_DB_PATH || '/var/data/geoip/GeoLite2-City.mmdb';

let reader = null;
let loadedMtime = 0;
let warned = false;

// The file is replaced twice a week by the update script; reopen it when it changes so no
// restart is needed.
async function getReader() {
    let mtime;
    try {
        mtime = fs.statSync(DB_PATH).mtimeMs;
    } catch (error) {
        if (!warned) {
            warned = true;
            console.warn(`GeoIP database not found at ${DB_PATH}; state/city lookup is off`);
        }
        return null;
    }
    if (!reader || mtime !== loadedMtime) {
        reader = await Reader.open(DB_PATH);
        loadedMtime = mtime;
    }
    return reader;
}

exports.lookupGeo = async (ip) => {
    try {
        if (!ip) return null;
        const r = await getReader();
        if (!r) return null;
        const res = r.city(ip);
        const cut = (v) => (v ? String(v).slice(0, 100) : null);
        return {
            country: cut(res.country && res.country.isoCode),
            state: cut(res.subdivisions && res.subdivisions[0] && res.subdivisions[0].names.en),
            city: cut(res.city && res.city.names.en),
        };
    } catch (error) {
        // AddressNotFoundError for private/unknown IPs is normal; anything else must not break logging.
        return null;
    }
};
