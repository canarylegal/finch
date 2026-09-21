#!/bin/bash
set -euo pipefail
LOG=/app/data/boot.log
mkdir -p /app/data
exec > >(tee -a "$LOG") 2>&1
echo "=== Finch boot $(date -Is) ==="
cd /app
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates python3 make g++ >/dev/null
echo "npm ci (including devDependencies)..."
npm ci --include=dev
echo "npm run build..."
rm -rf dist
npm run build
echo "starting server..."
exec node server/index.mjs
