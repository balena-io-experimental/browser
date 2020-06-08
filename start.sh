#!/usr/bin/bash

# check GPU mem setting for Raspberry Pi
if [[ $BALENA_DEVICE_TYPE == *"raspberry"* ]]; 
  then
  if [ "$(vcgencmd get_mem gpu | grep -o '[0-9]\+')" -lt 128 ]
    then
      echo -e "\033[91mWARNING: GPU MEMORY TOO LOW"
  fi
fi

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket


sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

# if FLAGS env var is not set, use default 
if [[ -z ${FLAGS+x} ]]
  then
    echo "Using default chromium flags"
    export FLAGS=" $KIOSK --disable-dev-shm-usage --ignore-gpu-blacklist --enable-gpu-rasterization --force-gpu-rasterization --autoplay-policy=no-user-gesture-required --user-data-dir=/usr/src/app/settings --enable-features=WebRTC-H264WithOpenH264FFmpeg"
fi

#create start script for X11
echo "#!/bin/bash" > /home/chromium/xstart.sh

# rotate screen if env variable is set [normal, inverted, left or right]
if [[ ! -z "$ROTATE_DISPLAY" ]]; then
  echo "(sleep 3 && xrandr -o $ROTATE_DISPLAY) &" >> /home/chromium/xstart.sh
fi

# if no window size has been specified, find the framebuffer size and use that
if [[ -z ${WINDOW_SIZE+x} ]]
  then
    export WINDOW_SIZE=$( cat /sys/class/graphics/fb0/virtual_size )
    echo "Using fullscreen: $WINDOW_SIZE"
fi

echo "xset s off -dpms" >> /home/chromium/xstart.sh
echo "chromium-browser $CHROME_LAUNCH_URL $FLAGS  --window-size=$WINDOW_SIZE" >> /home/chromium/xstart.sh

chmod 770 /home/chromium/*.sh 
chown chromium:chromium /home/chromium/xstart.sh


# make sure any lock on the Chromium profile is released
chown -R chromium:chromium /usr/src/app/settings
rm -f /usr/src/app/settings/SingletonLock


# run script as chromium user
su -c "export DISPLAY=:0 && startx /home/chromium/xstart.sh $CURSOR" - chromium