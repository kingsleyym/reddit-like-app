#!/usr/bin/env bash
# MenuBoard – erzeugt ein selbstsigniertes Tizen-Zertifikat und ein
# Security-Profil namens "MenuBoard" für die tizen-CLI (Linux/macOS).
#
# Das reicht für ältere Signage-Displays (Tizen 4.0 / 6.0). Bei Tizen 7/8
# verlangen die Displays in der Regel ein SAMSUNG-Zertifikat mit registrierter
# DUID – das lässt sich nur im Certificate Manager von Tizen Studio erzeugen
# (siehe README.md, Abschnitt "Variante B").
#
# Aufruf:  ./setup-cert.sh
set -euo pipefail

PROFILE="${PROFILE:-MenuBoard}"
PASSWORD="${PASSWORD:-menuboard}"
COUNTRY="${COUNTRY:-DE}"
STATE="${STATE:-Bayern}"
CITY="${CITY:-Muenchen}"
ORG="${ORG:-MenuBoard}"
UNIT="${UNIT:-IT}"
NAME="${NAME:-MenuBoard Admin}"
EMAIL="${EMAIL:-admin@menuboard.local}"
KEYFILE="${KEYFILE:-menuboard}"

find_tizen() {
  if [ -n "${TIZEN_CLI:-}" ]; then echo "$TIZEN_CLI"; return; fi
  if command -v tizen >/dev/null 2>&1; then command -v tizen; return; fi
  for p in "$HOME/tizen-studio/tools/ide/bin/tizen" \
           "$HOME/TizenStudio/tools/ide/bin/tizen" \
           "/opt/tizen-studio/tools/ide/bin/tizen"; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
  echo ""
}

TIZEN="$(find_tizen)"
if [ -z "$TIZEN" ]; then
  echo "tizen-CLI nicht gefunden. Tizen Studio installieren oder TIZEN_CLI setzen." >&2
  exit 1
fi
echo "tizen-CLI: $TIZEN"

DATA_DIR="${TIZEN_DATA:-$HOME/tizen-studio-data}"
AUTHOR_P12="$DATA_DIR/keystore/author/${KEYFILE}.p12"

echo "1/2  Author-Zertifikat erzeugen ..."
"$TIZEN" certificate \
  -a "$PROFILE" -p "$PASSWORD" \
  -c "$COUNTRY" -s "$STATE" -ct "$CITY" \
  -o "$ORG" -u "$UNIT" -n "$NAME" -e "$EMAIL" \
  -f "$KEYFILE"

if [ ! -f "$AUTHOR_P12" ]; then
  FOUND="$(find "$DATA_DIR" -name "${KEYFILE}.p12" 2>/dev/null | head -n1 || true)"
  [ -n "$FOUND" ] && AUTHOR_P12="$FOUND"
fi
echo "     Author-Zertifikat: $AUTHOR_P12"

echo "2/2  Security-Profil \"$PROFILE\" anlegen ..."
# Ohne -d wird automatisch das in Tizen Studio mitgelieferte
# Distributor-Zertifikat (Public-Level) verwendet.
"$TIZEN" security-profiles add -n "$PROFILE" -a "$AUTHOR_P12" -p "$PASSWORD"

echo
echo "Fertig. Profil: $PROFILE   Passwort: $PASSWORD"
echo "Weiter mit:  node build.js --server http://<SERVER-IP>:8787 --profile $PROFILE"
