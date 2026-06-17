#!/bin/bash
cd "$(dirname "$0")"
node scripts/generate-env.mjs 2>/dev/null || true
echo ""
echo "  Afrohörnan körs på:  http://localhost:8000"
echo "  (Använd INTE port 8765 — den är ett annat projekt)"
echo ""
python3 -m http.server 8000
