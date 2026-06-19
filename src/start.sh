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

# Block until the Display Sidecar container mounts the socket
echo "Waiting for display server to expose the Wayland socket..."
until [ -S "${WAYLAND_SOCKET}" ]; do
  sleep 1
done
echo "Wayland socket detected! Establishing connection permissions."

# Apply permissive permissions so the unprivileged 'chromium' user can read/write to the socket
chmod 777 "${XDG_RUNTIME_DIR}" || true
chmod 666 "${WAYLAND_SOCKET}" || true

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

# Launch the Node Management Service as the non-root 'chromium' user
echo "Starting Node.js server session..."
exec su -w "$environment" chromium -c "node /usr/src/app/server.js"