#!/usr/bin/bash

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

# if FLAGS env var is not set, use default 
if [[ -z ${FLAGS+x} ]]
  then
    echo "Using default chromium flags"
    export FLAGS="--disable-dev-shm-usage --autoplay-policy=no-user-gesture-required --noerrdialogs"

    # if DISABLE_GPU is NOT set, add the GPU flags
    if [[ ! -z ${DISABLE_GPU+x} ]] && [[ "$DISABLE_GPU" -eq "1" ]]
      then
        # don't add the GPU flags
        echo "Disabling GPU acceleration"
      else
        echo "Enabling GPU acceleration"
        FLAGS="$FLAGS --enable-features=WebRTC-H264WithOpenH264FFmpeg --ignore-gpu-blacklist --enable-gpu-rasterization --force-gpu-rasterization --gpu-sandbox-failures-fatal=no --enable-native-gpu-memory-buffers"
    fi
fi

# if the PERSISTENT enVar is set, add the appropriate flag
if [[ ! -z $PERSISTENT ]] && [[ "$PERSISTENT" -eq "1" ]]
  then
    echo "Adding user settings directory"
    FLAGS="$FLAGS --user-data-dir=/data"
fi

#create start script for X11
echo "#!/bin/bash" > /home/chromium/xstart.sh

# Only for the Pi4 since setting `display_rotate=1` doesn't work for KMS
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

# Set whether to run Chromium in config mode or not
# This sets the cursor to show by default
if [ ! -z ${KIOSK+x} ] && [ "$KIOSK" -eq "1" ]
  then
    export KIOSK='--kiosk --start-fullscreen'
    echo "Enabling kiosk mode"
    export CHROME_LAUNCH_URL="--app=$LAUNCH_URL"

    #Set whether to show a cursor or not
    if [[ ! -z $SHOW_CURSOR ]] && [[ "$SHOW_CURSOR" -eq "1" ]]
      then
        export CURSOR=''
        echo "Enabling cursor"
      else
        export CURSOR='-- -nocursor'
        echo "Disabling cursor"
    fi
  else
    export KIOSK=''
    export CHROME_LAUNCH_URL="$LAUNCH_URL"
    export CURSOR=''
    echo "Enabling cursor"
fi

# Allow users to turn the chromium std out and error on
if [ ! -z ${DEBUG+x} ] && [ "$DEBUG" -eq "1" ]
  then
    export OUTPUT=''
  else
    export OUTPUT='>/dev/null 2>&1'
fi

echo "xset s off -dpms" >> /home/chromium/xstart.sh
echo "chromium-browser $CHROME_LAUNCH_URL $FLAGS  --window-size=$WINDOW_SIZE $OUTPUT" >> /home/chromium/xstart.sh

chmod 770 /home/chromium/*.sh 
chown chromium:chromium /home/chromium/xstart.sh

# decide whether to use CEC to switch a connected TV on or not
# this will crash the device if no TV is connected, unless HDMI_hotplug is set in config.txt
if [ ! -z ${CONTROL_TV+x} ] && [ "$CONTROL_TV" -eq "1" ]
  then
    # Set the TV input to the device
    echo 'as' | cec-client -s -d 1
fi

# make sure any lock on the Chromium profile is released
chown -R chromium:chromium /data
rm -f /data/SingletonLock


# run script as chromium user
su -c "export DISPLAY=:0 && startx /home/chromium/xstart.sh $CURSOR $OUTPUT" - chromium