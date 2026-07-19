#!/usr/bin/env bash
#
# balena-env-diff.sh — compare the environment-variable NAMES this browser
# block supports against those currently set on a balena fleet and/or its
# devices, and report which supported variables are not set.
#
# Usage:
#   scripts/balena-env-diff.sh <fleet-slug>          # fleet-level vars
#   scripts/balena-env-diff.sh --all <fleet-slug>    # fleet + every device
#   scripts/balena-env-diff.sh --device <uuid>       # one device (inherits fleet)
#   FLEET=myorg/myfleet scripts/balena-env-diff.sh   # via env var
#
# The "supported" set is derived from the repo, not hard-coded, so it stays
# current as variables are added:
#   * process.env.<NAME> references in src/
#   * the environment-variable table in readme.md
#
# Only names are printed (never values), so this is safe to run and share.
# Note: most variables are OPTIONAL and have defaults, so "not set" is
# informational — it does not mean anything is broken.

set -euo pipefail

# --- Args --------------------------------------------------------------------
MODE="single"          # single | all
SCOPE_FLAG="--fleet"
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--all)    MODE="all"; SCOPE_FLAG="--fleet"; shift ;;
    -d|--device) SCOPE_FLAG="--device"; TARGET="${2:-}"; shift 2 ;;
    -f|--fleet)  SCOPE_FLAG="--fleet";  TARGET="${2:-}"; shift 2 ;;
    -h|--help)   sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           TARGET="$1"; shift ;;
  esac
done
TARGET="${TARGET:-${FLEET:-}}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <fleet-slug> | --all <fleet-slug> | --device <uuid>" >&2
  exit 2
fi
if [[ "$MODE" == "all" && "$SCOPE_FLAG" != "--fleet" ]]; then
  echo "Error: --all requires a fleet slug, not a device." >&2
  exit 2
fi

command -v balena >/dev/null || { echo "Error: balena CLI not found on PATH." >&2; exit 1; }
command -v node   >/dev/null || { echo "Error: node not found on PATH."        >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors (disabled when not a TTY or NO_COLOR is set)
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; CYN=""; RST=""
fi

# Drop blank lines and de-duplicate. The `|| true` keeps an all-blank (empty)
# input from returning grep's exit 1 and tripping `set -e`/pipefail.
sorted_unique() { { grep -vE '^[[:space:]]*$' || true; } | sort -u; }

# --- Names this block supports (union of code references + readme table) -----
EXPECTED="$(
  {
    grep -rhoE 'process\.env\.[A-Za-z0-9_]+' "$REPO_ROOT/src" 2>/dev/null | sed 's/process\.env\.//'
    grep -oE '^\|`[A-Z0-9_]+`'               "$REPO_ROOT/readme.md" 2>/dev/null | tr -d '|`'
  } \
  | grep -vE '^(BALENA_|VERSION$|CURSOR$|DISPLAY$|UDEV$|PULSE_SERVER$|DBUS_|NODE_)' \
  | sorted_unique || true
)"

# The env subcommand was renamed across CLI versions: older CLIs use
# `balena env list`, newer ones use `balena envs`. Try both.
get_env_json() {
  local scope="$1" target="$2" out
  out="$(balena env list "$scope" "$target" --json 2>/dev/null)" && [[ -n "$out" ]] && { printf '%s' "$out"; return 0; }
  out="$(balena envs      "$scope" "$target" --json 2>/dev/null)" && [[ -n "$out" ]] && { printf '%s' "$out"; return 0; }
  return 1
}

names_from_json() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{(JSON.parse(s)||[]).forEach(e=>e&&e.name&&console.log(e.name))}catch(_){}})'
}

count() { [[ -z "$1" ]] && echo 0 || printf '%s\n' "$1" | grep -c . ; }
list()  { if [[ -z "$1" ]]; then echo "    ${DIM}(none)${RST}"; else printf '%s\n' "$1" | sed "s/^/    ${2}- /;s/$/${RST}/"; fi; }

# diff_one <scope-flag> <target> <label>
diff_one() {
  local scope="$1" target="$2" label="$3"
  local json current missing present unknown

  echo "${CYN}${BOLD}› ${label}${RST}"
  if ! json="$(get_env_json "$scope" "$target")"; then
    echo "  ${RED}! could not read env vars (check login / slug / uuid)${RST}"
    echo
    return 0
  fi
  current="$(printf '%s' "$json" | names_from_json | sorted_unique)"

  missing="$(comm -23 <(printf '%s\n' "$EXPECTED" | sorted_unique) <(printf '%s\n' "$current" | sorted_unique) || true)"
  present="$(comm -12 <(printf '%s\n' "$EXPECTED" | sorted_unique) <(printf '%s\n' "$current" | sorted_unique) || true)"
  unknown="$(comm -13 <(printf '%s\n' "$EXPECTED" | sorted_unique) <(printf '%s\n' "$current" | sorted_unique) || true)"

  echo "  supported: $(count "$EXPECTED")   set here: $(count "$current")   recognised: $(count "$present")   unknown: $(count "$unknown")"
  echo "  ${GRN}set & recognised:${RST}"
  list "$present" "$GRN"
  echo "  ${YEL}supported but not set${RST} ${DIM}(most have defaults)${RST}:"
  list "$missing" "$YEL"
  echo "  ${DIM}set but not used by this block${RST} ${DIM}(other services / balena vars / typos)${RST}:"
  list "$unknown" "$DIM"
  echo
}

# List a fleet's devices as "uuid<TAB>label" lines.
list_devices() {
  local fleet="$1" out
  out="$(balena device list --fleet "$fleet" --json 2>/dev/null)" || \
  out="$(balena devices     --fleet "$fleet" --json 2>/dev/null)" || return 1
  printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{(JSON.parse(s)||[]).forEach(d=>{const id=d.uuid||String(d.id);const nm=d.deviceName||"(unnamed)";const on=d.isOnline?"online":"offline";console.log(`${id}\t${nm} [${on}]`)})}catch(_){}})'
}

# --- Run ---------------------------------------------------------------------
echo "${BOLD}balena env diff${RST}  —  target: ${BOLD}${TARGET}${RST}${DIM}  (mode: ${MODE})${RST}"
echo

if [[ "$MODE" == "single" ]]; then
  case "$SCOPE_FLAG" in
    --fleet)  diff_one --fleet  "$TARGET" "fleet: $TARGET" ;;
    --device) diff_one --device "$TARGET" "device: $TARGET" ;;
  esac
else
  # Fleet level first, then every device.
  diff_one --fleet "$TARGET" "fleet-wide: $TARGET"
  if ! devs="$(list_devices "$TARGET")"; then
    echo "${RED}Error:${RST} could not list devices for fleet '$TARGET'." >&2
    exit 1
  fi
  if [[ -z "$devs" ]]; then
    echo "${DIM}(fleet has no devices)${RST}"
  else
    while IFS=$'\t' read -r uuid label; do
      [[ -z "$uuid" ]] && continue
      diff_one --device "$uuid" "device: ${uuid:0:7}  ${label}"
    done <<< "$devs"
  fi
fi
