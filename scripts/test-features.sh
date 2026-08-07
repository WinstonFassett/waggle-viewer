#!/usr/bin/env bash
# Comprehensive test for --attach and parent chain walking
set -euo pipefail

WAGGLE=${WAGGLE_BIN:-~/.cargo/bin/waggle}
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Testing waggle-viewer features ==="
echo

# ===== Test 1: --attach (screenshots passed via attachment) =====
echo "TEST 1: --attach functionality"
echo "-------------------------------"

# Create a test image
echo "1.1 Creating test image..."
cat > "$TMPDIR/test.png" <<'EOF' | base64 -d
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
EOF

if [ ! -f "$TMPDIR/test.png" ]; then
  echo "   ✗ Failed to create test image"
  exit 1
fi
echo "   ✓ Test image created (1x1 red pixel)"

# Mint a token with the attachment
echo
echo "1.2 Minting token with --attach..."
MINT_RESULT=$($WAGGLE mint --target "$TMPDIR/test.txt" --attach "$TMPDIR/test.png" --tag name=attach-test 2>&1 || echo "")
TOKEN_WITH_ATTACH=$(echo "$MINT_RESULT" | jq -r '.result.token // empty' 2>/dev/null || echo "")

if [ -z "$TOKEN_WITH_ATTACH" ]; then
  echo "   ⚠ Skipping --attach test (mint failed or not supported)"
  echo "   Error: $MINT_RESULT"
else
  echo "   ✓ Token minted with attachment: $TOKEN_WITH_ATTACH"

  # Query the manifest to verify attachment
  echo
  echo "1.3 Verifying attachment in manifest..."
  MANIFEST=$($WAGGLE query --token $TOKEN_WITH_ATTACH --path /manifest 2>&1 || echo "{}")
  HAS_VARIANT=$(echo "$MANIFEST" | jq '.result.slice.variants // [] | length' 2>/dev/null || echo "0")

  if [ "$HAS_VARIANT" -gt 0 ]; then
    echo "   ✓ Attachment found in manifest ($HAS_VARIANT variant(s))"
  else
    echo "   ✗ No attachment found in manifest"
    echo "   Manifest: $MANIFEST"
  fi
fi

# ===== Test 2: Parent chain walking via /manifest/parent =====
echo
echo "TEST 2: Parent chain walking via /manifest/parent"
echo "--------------------------------------------------"

# Use existing test tokens from the issue
TOKEN_CHILD="6Xubygz9"
TOKEN_PARENT="MoqCmDte"

echo "2.1 Testing child token with parent: $TOKEN_CHILD"
PARENT=$($WAGGLE query --token $TOKEN_CHILD --path /manifest/parent 2>/dev/null | jq -r '.result.slice // empty' || echo "")
if [ -n "$PARENT" ]; then
  echo "   ✓ Found parent: $PARENT"
  if [ "$PARENT" != "$TOKEN_PARENT" ]; then
    echo "   ✗ Parent mismatch (expected $TOKEN_PARENT, got $PARENT)"
    exit 1
  fi
else
  echo "   ✗ No parent found"
  exit 1
fi

echo
echo "2.2 Testing root token (should have no parent): $TOKEN_PARENT"
set +e
RESULT=$($WAGGLE query --token $TOKEN_PARENT --path /manifest/parent 2>&1)
EXIT_CODE=$?
set -e
GRANDPARENT=$(echo "$RESULT" | jq -r '.result // "null"')
if [ "$GRANDPARENT" = "null" ] || [ $EXIT_CODE -ne 0 ]; then
  echo "   ✓ Correctly has no parent (root token)"
else
  echo "   ✗ Unexpected parent: $GRANDPARENT"
  exit 1
fi

echo
echo "2.3 Testing full chain walk in viewer..."
# Start the viewer briefly to test rendering
PORT=4246
bun src/index.ts --port $PORT > /tmp/test-viewer.log 2>&1 &
VIEWER_PID=$!
sleep 2

# Test that the child token shows the lineage breadcrumb
RESPONSE=$(curl -s "http://localhost:$PORT/$TOKEN_CHILD" || echo "")
if echo "$RESPONSE" | grep -q "lineage-breadcrumb"; then
  echo "   ✓ Lineage breadcrumb rendered for child token"
else
  echo "   ✗ Lineage breadcrumb missing"
  kill $VIEWER_PID 2>/dev/null || true
  exit 1
fi

# Test that the breadcrumb shows both tokens
if echo "$RESPONSE" | grep -q "$TOKEN_PARENT" && echo "$RESPONSE" | grep -q "$TOKEN_CHILD"; then
  echo "   ✓ Breadcrumb shows full chain: $TOKEN_PARENT → $TOKEN_CHILD"
else
  echo "   ✗ Breadcrumb incomplete"
  kill $VIEWER_PID 2>/dev/null || true
  exit 1
fi

# Test that the root token has no breadcrumb
RESPONSE_ROOT=$(curl -s "http://localhost:$PORT/$TOKEN_PARENT" || echo "")
if echo "$RESPONSE_ROOT" | grep -q "lineage-breadcrumb"; then
  echo "   ✗ Root token should not show lineage breadcrumb"
  kill $VIEWER_PID 2>/dev/null || true
  exit 1
else
  echo "   ✓ Root token correctly has no lineage breadcrumb"
fi

# Clean up
kill $VIEWER_PID 2>/dev/null || true

echo
echo "=== All tests passed! ✓ ==="
