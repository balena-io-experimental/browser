#!/usr/bin/env bash

set -e

# Enable user namespaces for Chromium's internal sandbox architecture
sysctl -w user.max_user_namespaces=10000 || true

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

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


# Dynamically map host DRI/Render GIDs to the container user space
# if [ -e /dev/dri/renderD128 ]; then
#     HOST_RENDER_GID=$(stat -c '%g' /dev/dri/renderD128)
#     echo "Detected host render node GID: ${HOST_RENDER_GID}"
#     groupadd -g "${HOST_RENDER_GID}" runtime-render || true
#     usermod -a -G runtime-render chromium
# elif [ -e /dev/dri/card0 ]; then
#     HOST_CARD_GID=$(stat -c '%g' /dev/dri/card0)
#     echo "Detected host graphics card GID: ${HOST_CARD_GID}"
#     groupadd -g "${HOST_CARD_GID}" runtime-render || true
#     usermod -a -G runtime-render chromium
# fi

# Launch the Node Management Service as the non-root 'chromium' user
echo "Starting Node.js server session..."
exec su -w "$environment" chromium -c "node /usr/src/app/server.js"