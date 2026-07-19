#!/usr/bin/env bash
#
# balena-env-diff.sh — compare the environment-variable NAMES this browser
# block supports against those currently set on a balena fleet, and report
# which supported variables are not set.
#
# Usage:
#   scripts/balena-env-diff.sh <fleet-slug>
#   FLEET=myorg/myfleet scripts/balena-env-diff.sh
#   scripts/balena-env-diff.sh --device <uuid>
#
# The "supported" set is derived from the repo, not hard-coded, so it stays
# current as variables are added:
#   * process.env.<NAME> references in src/
#   * the environment-variable table in readme.md
#
# Only names are printed (never values), so this is safe to run and share.
# Note: most of these variables are OPTIONAL and have defaults, so "not set"
# is informational — it does not mean anything is broken.

set -euo pipefail

# --- Args --------------------------------------------------------------------
SCOPE_FLAG="--fleet"
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--device) SCOPE_FLAG="--device"; TARGET="${2:-}"; shift 2 ;;
    -f|--fleet)  SCOPE_FLAG="--fleet";  TARGET="${2:-}"; shift 2 ;;
    -h|--help)   sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           TARGET="$1"; shift ;;
  esac
done
TARGET="${TARGET:-${FLEET:-}}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <fleet-slug>   (or: $0 --device <uuid>, or FLEET=<slug> $0)" >&2
  exit 2
fi

command -v balena >/dev/null || { echo "Error: balena CLI not found on PATH." >&2; exit 1; }
command -v node   >/dev/null || { echo "Error: node not found on PATH."        >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors (disabled when not a TTY or NO_COLOR is set)
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; RST=""
fi

# Drop blank lines and de-duplicate. The trailing `|| true` keeps an all-blank
# (empty) input from returning grep's exit 1 and tripping `set -e`/pipefail.
sorted_unique() { { grep -vE '^[[:space:]]*$' || true; } | sort -u; }

# --- 1. Names this block supports (union of code references + readme table) --
expected="$(
  {
    grep -rhoE 'process\.env\.[A-Za-z0-9_]+' "$REPO_ROOT/src" 2>/dev/null | sed 's/process\.env\.//'
    grep -oE '^\|`[A-Z0-9_]+`'               "$REPO_ROOT/readme.md" 2>/dev/null | tr -d '|`'
  } \
  | grep -vE '^(BALENA_|VERSION$|CURSOR$|DISPLAY$|UDEV$|PULSE_SERVER$|DBUS_|NODE_)' \
  | sorted_unique || true
)"

# --- 2. Names currently set on the fleet/device ------------------------------
# The subcommand was renamed across CLI versions: older CLIs use
# `balena env list`, newer ones use `balena envs`. Try both.
get_env_json() {
  local out
  out="$(balena env list "$SCOPE_FLAG" "$TARGET" --json 2>/dev/null)" && [[ -n "$out" ]] && { printf '%s' "$out"; return 0; }
  out="$(balena envs      "$SCOPE_FLAG" "$TARGET" --json 2>/dev/null)" && [[ -n "$out" ]] && { printf '%s' "$out"; return 0; }
  return 1
}

if ! target_json="$(get_env_json)"; then
  echo "${RED}Error:${RST} could not read env vars for $SCOPE_FLAG '$TARGET'." >&2
  echo "  Check the slug/uuid and that you're logged in (${BOLD}balena login${RST})." >&2
  exit 1
fi

current="$(
  printf '%s' "$target_json" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{(JSON.parse(s)||[]).forEach(e=>e&&e.name&&console.log(e.name))}catch(_){}})' \
  | sorted_unique
)"

# --- 3. Diff -----------------------------------------------------------------
missing="$(comm -23 <(printf '%s\n' "$expected" | sorted_unique) <(printf '%s\n' "$current" | sorted_unique) || true)"
present="$(comm -12 <(printf '%s\n' "$expected" | sorted_unique) <(printf '%s\n' "$current" | sorted_unique) || true)"
unknown="$(comm -13 <(printf '%s\n' "$expected" | sorted_unique) <(printf '%s\n' "$current" | sorted_unique) || true)"

count() { [[ -z "$1" ]] && echo 0 || printf '%s\n' "$1" | grep -c . ; }
list()  { if [[ -z "$1" ]]; then echo "  ${DIM}(none)${RST}"; else printf '%s\n' "$1" | sed "s/^/  ${2}- /;s/$/${RST}/"; fi; }

echo "${BOLD}balena env diff${RST}  —  $SCOPE_FLAG ${BOLD}${TARGET}${RST}"
echo "supported by block: $(count "$expected")   |   set on target: $(count "$current")"
echo
echo "${YEL}${BOLD}Supported but NOT set on the target${RST} ${DIM}(most are optional / have defaults)${RST}:"
list "$missing" "$YEL"
echo
echo "${GRN}${BOLD}Set and recognised by this block${RST}:"
list "$present" "$GRN"
echo
echo "${DIM}${BOLD}Set on target but NOT used by this block${RST} ${DIM}(other services, balena vars, or typos)${RST}:"
list "$unknown" "$DIM"
