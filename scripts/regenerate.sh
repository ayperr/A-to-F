#!/usr/bin/env bash
# Rebuild every piece of site data, then have Claude Code check it headlessly.
#
#   ./scripts/regenerate.sh            # rebuild + verify
#   ./scripts/regenerate.sh --no-claude
#
# The verification runs `claude -p` (headless mode) with the landmark-verifier subagent, read-only
# tools only, and saves the JSON result to reports/verify.json. A DO NOT SHIP verdict fails the script.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-.venv/bin/python}

$PY pipeline/landmarks.py --download
$PY pipeline/basemap.py --download
$PY pipeline/build_data.py
$PY pipeline/basemap.py
$PY pipeline/stats.py
$PY pipeline/view_of_week.py
$PY pipeline/check_claims.py --strict
$PY -m pytest pipeline -q
(cd web && npm test --silent)

if [[ "${1:-}" == "--no-claude" ]]; then exit 0; fi
mkdir -p reports
claude -p "Use the landmark-verifier subagent to check web/public/data. Reply with its table, then a final line that is exactly SHIP or DO NOT SHIP." \
  --output-format json \
  --allowedTools "Read" "Grep" "Glob" "Bash(python *)" "Bash(.venv/bin/python *)" "Bash(cd web && npm test)" \
  > reports/verify.json
if grep -q "DO NOT SHIP" reports/verify.json; then
  echo "Verifier says DO NOT SHIP. See reports/verify.json" >&2
  exit 1
fi
echo "Verifier says SHIP."
