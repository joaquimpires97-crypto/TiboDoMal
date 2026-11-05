#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must point to the worker metadata directory}"
PORT="${PORT:-3000}"
export PORT

/usr/bin/time -p npm install --no-audit --no-fund
/usr/bin/time -p npm run build
/usr/bin/time -p mkdir -p "$OPENCODE_WEB_DIR"
/usr/bin/time -p node --input-type=module -e 'import { writeFile } from "node:fs/promises"; const project = process.cwd(); const directory = `${project}/dist`; await writeFile(`${process.env.OPENCODE_WEB_DIR}/deployment-output.json`, JSON.stringify({ project, directory }));'
/usr/bin/time -p npm start
