#!/usr/bin/env bash
#
# Build + run the HA-login test harness inside a production-like Docker
# container (Node 22 + Chromium, headless), so any fix transfers to the device.
#
# Usage:
#   HA_USERNAME=you HA_PASSWORD=secret \
#     scripts/test-recorder-docker.sh --url http://192.168.4.101:8123/lovelace-tvboard/tvboard
#
# Options after the script name are passed through to the harness, e.g.
#   --url <url>           (required in Docker: mDNS discovery doesn't cross
#                          Docker Desktop's VM boundary on macOS)
#   --script <path>       defaults to the baked-in recorder-scripts/ha_login.json;
#                          to test a NEW export, mount it (see MOUNT_SCRIPT below).
#
# Screenshots + form-probe JSON are written to ./.recorder-test-out on the host.
#
# Env:
#   MOUNT_SCRIPT=/abs/path/to/ha_login.json   test a recording without rebuilding

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/.recorder-test-out"
IMAGE="browser-recorder-test"

command -v docker >/dev/null || { echo "docker not found on PATH." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon not running — start Docker Desktop (open -a Docker) and retry." >&2; exit 1; }

if [[ -z "${HA_USERNAME:-}" || -z "${HA_PASSWORD:-}" ]]; then
  echo "Warning: HA_USERNAME / HA_PASSWORD not set; the recording's own values will be used." >&2
fi

echo "==> Building $IMAGE (first build installs Chromium; subsequent builds are cached)"
docker build -f "$REPO_ROOT/scripts/Dockerfile.test" -t "$IMAGE" "$REPO_ROOT"

mkdir -p "$OUT_DIR"

MOUNTS=(-v "$OUT_DIR:/out")
SCRIPT_ARGS=()
if [[ -n "${MOUNT_SCRIPT:-}" ]]; then
  MOUNTS+=(-v "$(cd "$(dirname "$MOUNT_SCRIPT")" && pwd)/$(basename "$MOUNT_SCRIPT"):/app/recorder-scripts/ha_login.json:ro")
  echo "==> Testing mounted recording: $MOUNT_SCRIPT"
fi

echo "==> Running harness (headless). Artifacts -> $OUT_DIR"
docker run --rm \
  -e HA_USERNAME -e HA_PASSWORD -e MDNS_DISCOVER_PATH \
  "${MOUNTS[@]}" \
  "$IMAGE" "$@" || true

echo
echo "==> Done. Inspect results:"
echo "    open $OUT_DIR            # before.png / failure.png / success.png"
echo "    cat  $OUT_DIR/controls-before.json   # real login-form selectors"
