#!/bin/bash
# Downloads the latest MaxMind GeoLite2-City database and swaps it in without downtime.
# Needs MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY in the environment (or in /etc/geolite.env).
# Cron (MaxMind publishes Tue and Fri):   30 3 * * 3,6  /path/to/scripts/update-geolite.sh >> /var/log/geolite-update.log 2>&1
set -euo pipefail
[ -f /etc/geolite.env ] && . /etc/geolite.env
DIR="${GEOIP_DIR:-/var/data/geoip}"
: "${MAXMIND_ACCOUNT_ID:?set MAXMIND_ACCOUNT_ID}" "${MAXMIND_LICENSE_KEY:?set MAXMIND_LICENSE_KEY}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL -u "$MAXMIND_ACCOUNT_ID:$MAXMIND_LICENSE_KEY" \
  "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" -o "$TMP/db.tar.gz"
tar -xzf "$TMP/db.tar.gz" -C "$TMP"
NEW="$(find "$TMP" -name 'GeoLite2-City.mmdb' | head -1)"
[ -s "$NEW" ] || { echo "no mmdb in download"; exit 1; }
mkdir -p "$DIR"
cp "$NEW" "$DIR/GeoLite2-City.mmdb.new"
mv -f "$DIR/GeoLite2-City.mmdb.new" "$DIR/GeoLite2-City.mmdb"   # atomic; the app reopens it when the file changes
echo "$(date -Is) updated GeoLite2-City"
