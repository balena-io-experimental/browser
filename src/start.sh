#!/usr/bin/env bash

# Run balena base image entrypoint script
/usr/bin/entry.sh echo "Running balena base image entrypoint..."

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

# this stops the CPU performance scaling down
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

# If the vcgencmd is supported (i.e. RPi device) - check enough GPU memory is allocated
if command -v vcgencmd &> /dev/null
then
	echo "Checking GPU memory"
    if [ "$(vcgencmd get_mem gpu | grep -o '[0-9]\+')" -lt 128 ]
	then
	echo -e "\033[91mWARNING: GPU MEMORY TOO LOW"
	fi
fi

# set up the user data area
chown -R chromium:chromium /data
mkdir -p /data/chromium
rm -f /data/chromium/SingletonLock

# launch Chromium and whitelist the enVars so that they pass through to the su session
su -w "LAUNCH_URL,PERSISTENT,KIOSK,LOCAL_HTTP_DELAY,FLAGS,ROTATE_DISPLAY,ENABLE_GPU,WINDOW_SIZE,WINDOW_POSITION" -c "export DISPLAY=:0 && startx /usr/src/app/startx.sh $CURSOR" - chromium