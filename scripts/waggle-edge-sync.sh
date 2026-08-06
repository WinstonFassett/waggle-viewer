#!/usr/bin/env bash
# waggle-edge-sync.sh — replicate this machine's waggle store to a
# self-hosted edge (the edge-server.ts on the mini).
#
# `waggle edge push` replicates records + the `manifest.content` snapshot
# blobs, but NOT folder tree/trigram blobs or child-file blobs (a known
# gap in edge push itself). This script runs edge push, then syncs the
# FULL blob CAS so folder tokens render and grep on the remote too.
#
# Usage:
#   WAGGLE_EDGE_URL=http://mac-mini.tailc3138.ts.net:7412 \
#   WAGGLE_EDGE_BEARER=<secret> \
#   ./scripts/waggle-edge-sync.sh
#
# Environment:
#   WAGGLE_EDGE_URL     edge server base URL (required)
#   WAGGLE_EDGE_BEARER  bearer secret, >=16 chars (required)
#   WAGGLE_DIR          waggle root (default ~/.waggle)
set -euo pipefail

: "${WAGGLE_EDGE_URL:?set WAGGLE_EDGE_URL (the edge-server base URL)}"
: "${WAGGLE_EDGE_BEARER:?set WAGGLE_EDGE_BEARER (>=16 chars)}"
WAGGLE_DIR="${WAGGLE_DIR:-$HOME/.waggle}"
BLOB_ROOT="$WAGGLE_DIR/blobs"
AUTH="authorization: Bearer $WAGGLE_EDGE_BEARER"

echo "→ pushing records + content blobs (waggle edge push)…"
waggle edge push --url "$WAGGLE_EDGE_URL" --bearer "$WAGGLE_EDGE_BEARER"

echo "→ syncing full blob CAS (tree/trigram/child blobs)…"
remote_shas=$(curl -fsS "$WAGGLE_EDGE_URL/blobs" -H "$AUTH")
pushed=0
skipped=0
while IFS= read -r blob; do
  sha=$(basename "$blob")
  [[ "$sha" == .tmp-* ]] && continue
  if printf '%s' "$remote_shas" | grep -q "\"$sha\""; then
    skipped=$((skipped + 1))
    continue
  fi
  b64=$(base64 -i "$blob")
  curl -fsS -X POST "$WAGGLE_EDGE_URL/store" \
    -H "$AUTH" -H "content-type: application/json" \
    -d "{\"op\":\"put-blob\",\"content_type\":\"application/octet-stream\",\"b64\":\"$b64\"}" >/dev/null
  pushed=$((pushed + 1))
done < <(find "$BLOB_ROOT" -type f 2>/dev/null || true)

echo "✓ done — blobs pushed: $pushed, already present: $skipped"
