#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
RUNTIME_DIR="${RUNTIME_DIR:-${RUNNER_TEMP:-/home/runner/work/_temp}/omgithub-runtime}"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence directory}"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
export CAPTURE_STRICT=1
export CAPTURE_READY_SELECTOR="${CAPTURE_READY_SELECTOR:-#gate h1}"
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-capture.mjs"
