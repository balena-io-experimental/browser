#!/usr/bin/env bash

set -e

# Enable user namespaces for Chromium's internal sandbox architecture
sysctl -w user.max_user_namespaces=10000 || true

echo "balenaLabs browser version: $(<VERSION)"

# Secure performance scaling configuration
echo "Setting CPU Scaling Governor to 'performance'"
if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
    echo 'performance' > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor || true
fi

# Map Wayland Socket Parameters
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-"/run/user/0"}
export WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-"wayland-0"}
WAYLAND_SOCKET="${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}"

echo "Targeting Wayland compositor socket: ${WAYLAND_SOCKET}"

# Initialize user-data storage context
mkdir -p /data/chromium
chown -R chromium:chromium /data || true
rm -f /data/chromium/SingletonLock

# we can't maintain the environment with su, because we are logging in to a new session
# so we need to manually pass in the environment variables to maintain, in a whitelist
# This gets the current environment, as a comma-separated string
environment=$(env | grep -v -w '_' | awk -F= '{ st = index($0,"=");print substr($1,0,st) ","}' | tr -d "\n")
# remove the last comma
environment="${environment::-1}"


# Grant the unprivileged 'chromium' user access to the GPU, video-decode and
# sound device nodes. These nodes (/dev/dri/card*, /dev/dri/render*, /dev/video*,
# /dev/snd/*) are group-owned by the host's 'video'/'render'/'audio' GIDs with
# mode 0660, so uid 1000 cannot open them by default. Without this, hardware GL
# falls back to the one world-readable render node, V4L2 hardware video decode
# fails silently (Chromium drops to the software FFmpegVideoDecoder), and ALSA
# audio output (e.g. HDMI) is silent. We map each node's owning GID into the
# container and add 'chromium' to the matching group before su.
for dev in /dev/dri/card* /dev/dri/render* /dev/video* /dev/snd/*; do
    [ -e "$dev" ] || continue
    node_gid=$(stat -c '%g' "$dev")
    node_grp=$(getent group "$node_gid" | cut -d: -f1)
    if [ -z "$node_grp" ]; then
        node_grp="hwaccel_${node_gid}"
        groupadd -g "$node_gid" "$node_grp" || true
    fi
    usermod -aG "$node_grp" chromium || true
    echo "Granted chromium access to ${dev} (gid ${node_gid}, group ${node_grp})"
done

# Optionally pin the ALSA default output from AUDIO_OUTPUT_DEVICE (see audio-output.sh)
. "$(dirname "$0")/audio-output.sh"

# Supervise the browser session and reconnect whenever the display block restarts.
# The display block deletes and recreates the Wayland socket on every restart; we run
# as root here, so we can re-apply the socket permissions and relaunch Chromium each
# time. We poll the socket's INODE (not just its existence) so a delete+recreate that
# happens between two polls is still detected (the new socket has a different inode).
while true; do
  echo "Waiting for display server to expose the Wayland socket..."
  until [ -S "${WAYLAND_SOCKET}" ]; do sleep 1; done
  echo "Wayland socket detected. Applying connection permissions."

  # Apply permissive permissions so the unprivileged 'chromium' user can reach the (new) socket
  chmod 777 "${XDG_RUNTIME_DIR}" || true
  chmod 666 "${WAYLAND_SOCKET}"  || true
  connected_socket_inode=$(stat -c %i "${WAYLAND_SOCKET}")

  # Launch the Node Management Service as the non-root 'chromium' user.
  # setsid gives it its own process group so we can reap node + Chromium together.
  echo "Starting Node.js server session..."
  setsid su -w "$environment" chromium -c "node /usr/src/app/server.js" &
  browser_session_pid=$!

  # Run until the session exits OR the socket is replaced/removed (display restarted).
  # A deleted socket makes stat fail -> empty string -> inode mismatch -> loop exits.
  while kill -0 "${browser_session_pid}" 2>/dev/null \
        && [ "$(stat -c %i "${WAYLAND_SOCKET}" 2>/dev/null)" = "${connected_socket_inode}" ]; do
    sleep 1
  done

  echo "Display socket changed or session ended; restarting browser session."
  kill -- -"${browser_session_pid}" 2>/dev/null || true   # reap node + Chromium (process group)
  wait 2>/dev/null || true
done