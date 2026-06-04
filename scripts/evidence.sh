#!/usr/bin/env bash
set -euo pipefail

echo "=== Bubblewire Evidence Regeneration ==="
echo

echo "-> Running tests..."
npm test

echo
echo "-> Running type/lint check..."
npm run check

echo
echo "-> Generating proof receipt..."
npm run proof

echo
echo "-> Evidence regeneration complete."
echo "   - Tests: passed"
echo "   - Check: clean"
echo "   - Proof: docs/evidence/logs/proof.json"
echo
echo "For live-only verification, run:"
echo "  DEMO_MODE=off npm run proof:live"
