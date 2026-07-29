#!/usr/bin/env bash
# MenuBoard – Wrapper um build.js (Linux/macOS).
#   ./build.sh --server http://192.168.1.50:8787 --profile MenuBoard
set -euo pipefail
cd "$(dirname "$0")"
exec node build.js "$@"
