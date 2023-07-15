#!/usr/bin/env bash

# this allows chromium sandbox to run, see https://github.com/balena-os/meta-balena/issues/2319
sysctl -w user.max_user_namespaces=10000

# Run balena base image entrypoint script
/usr/bin/entry.sh echo "Running balena base image entrypoint..."

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket


xwrapper_config="/etc/X11/Xwrapper.config"
# Check if the Xwrapper.config file exists
if [[ -f "$xwrapper_config" ]]; then
  # Modify the Xwrapper.config file using sed
  sed -i 's/^allowed_users=.*/allowed_users=anybody/' "$xwrapper_config"
  echo "Xwrapper.config modified."
else
  touch "$xwrapper_config"
  echo 'allowed_users=' > "$xwrapper_config"
  sed -i 's/^allowed_users=.*/allowed_users=anybody/' "$xwrapper_config"
  echo "Xwrapper.config file not found so I made one :)"
fi

echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
if [[ $(lsb_release -i | awk '{print $3}') == "Debian" ]]; then
  dpkg-reconfigure xserver-xorg-legacy
fi

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

# When using alpine the vcgencmd isn't supported :(
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
mkdir -p /data/chromium
chown -R chromium:chromium /data
rm -f /data/chromium/SingletonLock



# launch Chromium and whitelist the enVars so that they pass through to the su session
if [[ $(lsb_release -i | awk '{print $3}') == "Debian" ]]; then
  # we can't maintain the environment with su, because we are logging in to a new session
  # so we need to manually pass in the environment variables to maintain, in a whitelist
  # This gets the current environment, as a comma-separated string
  environment=$(env | grep -v -w '_' | awk -F= '{ st = index($0,"=");print substr($1,0,st) ","}' | tr -d "\n")
  # remove the last comma
  environment="${environment::-1}"
  
  su -w $environment -c "export DISPLAY=:$DISPLAY_NUM && startx /dist/startx.sh $CURSOR" - chromium
elif [[ $(lsb_release -i | awk '{print $3}') == "Alpine" ]]; then
  # Alpine busybox su maintains the environment.
  su -c "export DISPLAY=:$DISPLAY_NUM && startx /dist/startx.sh $CURSOR" chromium
else
  echo "Unknown operating system."
fi

balena-idle
