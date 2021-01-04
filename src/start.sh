#!/usr/bin/env bash

# Run balena base image entrypoint script
/usr/bin/entry.sh echo "Running balena base image entrypoint..."

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

PULSE_SERVER=${PULSE_SERVER:-tcp:audio:4317}
export PULSE_SERVER=$PULSE_SERVER

# if the PERSISTENT enVar is set, add the appropriate flag
if [[ ! -z $PERSISTENT ]] && [[ "$PERSISTENT" -eq "1" ]]
  then
    # make sure any lock on the Chromium profile is released
    chown -R chromium:chromium /data
    rm -f /data/SingletonLock
fi

echo "Setting CPU Scaling Governor to 'performance'"
echo 'performance' > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 

 #Set whether to show a cursor or not
if [[ ! -z $SHOW_CURSOR ]] && [[ "$SHOW_CURSOR" -eq "1" ]]
  then
    export CURSOR=''
    echo "Enabling cursor"
  else
    export CURSOR='-- -nocursor'
    echo "Disabling cursor"
fi

export DISPLAY=:0 && startx /usr/src/app/startx.sh $CURSOR