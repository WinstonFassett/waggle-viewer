#!/usr/bin/env bash
# Test script for parent chain walking via /manifest/parent
set -euo pipefail

WAGGLE=${WAGGLE_BIN:-~/.cargo/bin/waggle}

echo "Testing parent chain walk..."
echo

# Test token with a parent
TOKEN1="6Xubygz9"
echo "1. Testing token with parent: $TOKEN1"
PARENT=$($WAGGLE query --token $TOKEN1 --path /manifest/parent 2>/dev/null | jq -r '.result.slice // empty')
if [ -n "$PARENT" ]; then
  echo "   ✓ Found parent: $PARENT"
else
  echo "   ✗ No parent found"
  exit 1
fi

# Test the parent token (should have no parent)
echo
echo "2. Testing root token (should have no parent): $PARENT"
set +e
RESULT=$($WAGGLE query --token $PARENT --path /manifest/parent 2>&1)
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
echo "3. Testing full chain walk..."
# Start the viewer briefly to test rendering
PORT=4245
bun src/index.ts --port $PORT > /tmp/test-viewer.log 2>&1 &
VIEWER_PID=$!
sleep 2

# Test that the child token shows the lineage breadcrumb
RESPONSE=$(curl -s "http://localhost:$PORT/$TOKEN1")
if echo "$RESPONSE" | grep -q "lineage-breadcrumb"; then
  echo "   ✓ Lineage breadcrumb rendered for child token"
else
  echo "   ✗ Lineage breadcrumb missing"
  kill $VIEWER_PID 2>/dev/null || true
  exit 1
fi

# Test that the breadcrumb shows both tokens
if echo "$RESPONSE" | grep -q "$PARENT" && echo "$RESPONSE" | grep -q "$TOKEN1"; then
  echo "   ✓ Breadcrumb shows full chain: $PARENT → $TOKEN1"
else
  echo "   ✗ Breadcrumb incomplete"
  kill $VIEWER_PID 2>/dev/null || true
  exit 1
fi

# Test that the root token has no breadcrumb
RESPONSE_ROOT=$(curl -s "http://localhost:$PORT/$PARENT")
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
echo "All tests passed! ✓"
