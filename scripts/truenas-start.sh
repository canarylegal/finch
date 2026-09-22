#!/bin/bash
set -euo pipefail
LOG=/app/data/boot.log
mkdir -p /app/data
exec > >(tee -a "$LOG") 2>&1
echo "=== Finch boot $(date -Is) ==="
cd /app

if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock-hash ] || ! cmp -s package-lock.json node_modules/.package-lock-hash 2>/dev/null; then
  echo "npm ci (including devDependencies)..."
  npm ci --include=dev
  cp package-lock.json node_modules/.package-lock-hash
else
  echo "node_modules up to date — skipping npm ci"
fi

echo "npm run build..."
rm -rf dist
npm run build
echo "starting server..."
exec node server/index.mjs
