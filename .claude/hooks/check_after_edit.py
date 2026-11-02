#!/usr/bin/env python3
"""PostToolUse hook: after an edit, run the check that protects what was just touched.

- narration.json          -> pipeline/check_claims.py --strict (side claims must match the geometry)
- engine code (py or ts)  -> Python engine tests + the TypeScript parity suite
Exit 2 shows the failure to Claude so it fixes the text or code in the same turn.
"""
import json
import os
import subprocess
import sys

root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
event = json.load(sys.stdin)
path = (event.get("tool_input") or {}).get("file_path", "").replace("\\", "/")
py = os.path.join(root, ".venv", "bin", "python")
py = py if os.path.exists(py) else sys.executable


def run(cmd, cwd=root):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=170)
    return r.returncode, (r.stdout + r.stderr)[-3000:]


checks = []
if path.endswith("web/public/data/narration.json"):
    checks.append(("claim check", [py, "pipeline/check_claims.py", "--strict"], root))
engine = ("pipeline/solar.py", "pipeline/sun_geometry.py", "pipeline/landmarks.py", "pipeline/fetch_tracks.py",
          "web/lib/engine/solar.ts", "web/lib/engine/geometry.ts", "web/lib/engine/time.ts")
if path.endswith(engine):
    checks.append(("engine tests", [py, "-m", "pytest", "pipeline", "-q", "-x"], root))
    checks.append(("TS parity", ["npx", "vitest", "run", "--silent"], os.path.join(root, "web")))

for name, cmd, cwd in checks:
    code, out = run(cmd, cwd)
    if code != 0:
        print(f"{name} failed after editing {path}:\n{out}", file=sys.stderr)
        if "pipeline/" in path:
            print("If you changed the Python engine, rebuild data (python pipeline/build_data.py) and mirror the "
                  "change in web/lib/engine so the parity suite passes.", file=sys.stderr)
        sys.exit(2)
sys.exit(0)
