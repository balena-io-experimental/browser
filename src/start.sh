#!/usr/bin/env bash

# this allows chromium sandbox to run, see https://github.com/balena-os/meta-balena/issues/2319
sysctl -w user.max_user_namespaces=10000

# Run balena base image entrypoint script
/usr/bin/entry.sh echo "Running balena base image entrypoint..."

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

echo "balenaLabs browser version: $(<VERSION)"

# this stops the CPU performance scaling down
echo "Setting CPU Scaling Governor to 'performance'"
echo 'performance' > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 

# check if display number envar was set
if [[ -z "$DISPLAY_NUM" ]]
  then
    export DISPLAY_NUM=0
fi

# set whether to show a cursor or not
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

if [ "${BALENA_DEVICE_TYPE}" = "raspberrypi5" ]
then
    # Inject X11 config on the RPi 5 as the defaults do not work
    # We do this in the startup script and only for the RPi 5 because
    # we build the images per-architecture and we do not want to break
    # other aarch64-based device types
    echo "Raspberry Pi 5 detected, injecting X.org config"
    cp -a "/usr/src/build/rpi/99-vc4.conf" "/etc/X11/xorg.conf.d/"
elif [ "${BALENA_DEVICE_TYPE}" = "raspberrypi0-2w-64" ]
then
    # The low memory warning which the chromium wrapper script generates 
    # on this platform can't be dismissed if the device is being used
    # as a display kiosk only and doesn't have a mouse/pointer device 
    # attached
    echo "Disabling low memory warning (always triggers on ${BALENA_DEVICE_TYPE})"
    if [ -z "$EXTRA_FLAGS" ]
    then
        export EXTRA_FLAGS="--no-memcheck"
    else
        # insert --no-memcheck before the content of EXTRA_FLAGS 
        # passed in from the docker-compose.yml environment so 
        # that --memcheck will be honoured if the author of the 
        # docker-compose.yml chooses to specify it there
        export EXTRA_FLAGS="--no-memcheck $EXTRA_FLAGS"
    fi
fi

# set up the user data area
mkdir -p /data/chromium
chown -R chromium:chromium /data
rm -f /data/chromium/SingletonLock

# we can't maintain the environment with su, because we are logging in to a new session
# so we need to manually pass in the environment variables to maintain, in a whitelist
# This gets the current environment, as a comma-separated string
environment=$(env | grep -v -w '_' | awk -F= '{ st = index($0,"=");print substr($1,0,st) ","}' | tr -d "\n")
# remove the last comma
environment="${environment::-1}"

# launch Chromium and whitelist the enVars so that they pass through to the su session
su -w $environment -c "export DISPLAY=:$DISPLAY_NUM && startx /usr/src/app/startx.sh $CURSOR" - chromium
balena-idle

