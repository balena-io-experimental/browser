#!/usr/bin/env bash

# Run balena base image entrypoint script
/usr/bin/entry.sh echo "Running balena base image entrypoint..."

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

PULSE_SERVER=${PULSE_SERVER:-tcp:audio:4317}
export PULSE_SERVER=$PULSE_SERVER

export WINDOW_SIZE=$( cat /sys/class/graphics/fb0/virtual_size )

export DISPLAY=:0 && startx /usr/src/app/startx.sh