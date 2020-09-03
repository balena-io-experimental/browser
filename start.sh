#!/usr/bin/bash

function reverse_window_coordinates () {
  local INPUT=$1

  IFS=', ' read -a coords <<< $INPUT
  if [ ${#coords[@]} -eq 2 ]; then
    echo "${coords[1]},${coords[0]}"
  else
    echo "Screen coordinates not set correctly, so cannot reverse them."
  fi 
}


# Run balena base image entrypoint script
/usr/bin/entry.sh echo "Running balena base image entrypoint..."

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sed -i -e 's/console/anybody/g' /etc/X11/Xwrapper.config
echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
dpkg-reconfigure xserver-xorg-legacy

# work out what to display
if [[ -z ${LAUNCH_URL+x} ]]
  # no launch URL, so try to find a local port 80
  then
    # if a delay period has been set
    if [[ ! -z ${LOCAL_HTTP_DELAY+x} ]]
      then
        echo "Waiting for $LOCAL_HTTP_DELAY seconds before checking for a local HTTP service."
        sleep "$LOCAL_HTTP_DELAY"
    fi

    # if HTTP 200 is returned from curl'ing the localhost - requires host networking
    if [ "$(curl -o /dev/null -s -w "%{http_code}\n" http://localhost)" -eq "200" ]
      then
        echo "Local HTTP service found. Redirecting to http://localhost"
        LAUNCH_URL="http://localhost"
      else
      echo "No LAUNCH_URL set and no local HTTP service found. Displaying default page."
        LAUNCH_URL="file:///home/chromium/index.html"
      fi
fi

# if FLAGS env var is not set, use default 
if [[ -z ${FLAGS+x} ]]
  then
    echo "Using default chromium flags"
    # --disable-dev-shm-usage = disable shared memory. Necessary because default size is too small for Chromium and causes crashes.
    # --autoplay-policy=no-user-gesture-required = stops you needing to click play on videos
    # --check-for-update-interval = stop Chromium complaining about not being able to auto-update
    # --noerrdialogs --disable-session-crashed-bubble = turn off error pop-ups
    export FLAGS="--disable-dev-shm-usage --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble --check-for-update-interval=31536000"

    # if ENABLE_GPU is set add the GPU flags
    if [[ ! -z ${ENABLE_GPU+x} ]] && [[ "$ENABLE_GPU" -eq "1" ]]
      then
        echo "Enabling GPU acceleration"
        FLAGS="$FLAGS --enable-features=WebRTC-H264WithOpenH264FFmpeg --ignore-gpu-blacklist --enable-gpu-rasterization --force-gpu-rasterization --gpu-sandbox-failures-fatal=no --enable-native-gpu-memory-buffers"
      else
        # don't add the GPU flags
        echo "Disabling GPU acceleration"
    fi
fi

# if the PERSISTENT enVar is set, add the appropriate flag
if [[ ! -z $PERSISTENT ]] && [[ "$PERSISTENT" -eq "1" ]]
  then
    echo "Adding user settings directory"
    FLAGS="$FLAGS --user-data-dir=/data"

    # make sure any lock on the Chromium profile is released
    chown -R chromium:chromium /data
    rm -f /data/SingletonLock
fi

#create start script for X11
echo "#!/bin/bash" > /home/chromium/xstart.sh

# if no window size has been specified, find the framebuffer size and use that
if [[ -z ${WINDOW_SIZE+x} ]]
  then
    export WINDOW_SIZE=$( cat /sys/class/graphics/fb0/virtual_size )
    echo "Using fullscreen: $WINDOW_SIZE"
  else
    echo "Custom window size set to $WINDOW_SIZE"
fi

# if no window position has been specified, use the default
if [[ -z ${WINDOW_POSITION+x} ]]
  then
    export WINDOW_POSITION="0,0"
    echo "Using default window position"
fi

# rotate screen if env variable is set [normal, inverted, left or right]
if [[ ! -z "$ROTATE_DISPLAY" ]]; then
  echo "(sleep 3 && xrandr -o $ROTATE_DISPLAY) &" >> /home/chromium/xstart.sh

  #If the display is rotated to left or right, we need to reverse the size and position coords
  if [[ "$ROTATE_DISPLAY" == "left" ]] || [[ "$ROTATE_DISPLAY" == "right" ]]; then
    
    echo "Display rotated to portait. Reversing screen coordinates"
    
    #window size
    REVERSED_SIZE="$(reverse_window_coordinates $WINDOW_SIZE)"
    WINDOW_SIZE=$REVERSED_SIZE
    echo "Reversed window size: $WINDOW_SIZE"
    
    #window position, if set
    if [[ "$WINDOW_POSITION" -ne "0,0" ]]
    then
      REVERSED_POSITION="$(reverse_window_coordinates $WINDOW_POSITION)"
      export WINDOW_POSITION=$REVERSED_POSITION
      echo "Reversed window position: $WINDOW_POSITION"
    fi
  fi
fi

# Set whether to run Chromium in config mode or not
# This sets the cursor to show by default
if [ ! -z ${KIOSK+x} ] && [ "$KIOSK" -eq "1" ]
  then
    echo "Enabling kiosk mode"
    export CHROME_LAUNCH_URL="--app=$LAUNCH_URL" 
  else
    export CHROME_LAUNCH_URL="$LAUNCH_URL"
fi

 #Set whether to show a cursor or not
if [[ ! -z $SHOW_CURSOR ]] && [[ "$SHOW_CURSOR" -eq "1" ]]
  then
    export CURSOR=''
    echo "Enabling cursor"
  else
    export CURSOR='-- -nocursor'
    echo "Disabling cursor"
fi

# Allow users to turn the chromium std out and error on
if [ ! -z ${DEBUG+x} ] && [ "$DEBUG" -eq "1" ]
  then
    export OUTPUT=''
  else
    export OUTPUT='>/dev/null 2>&1'
fi

echo "xset s off -dpms" >> /home/chromium/xstart.sh
echo "chromium-browser $CHROME_LAUNCH_URL $FLAGS  --window-size=$WINDOW_SIZE --window-position=$WINDOW_POSITION $OUTPUT" >> /home/chromium/xstart.sh

chmod 770 /home/chromium/*.sh 
chown chromium:chromium /home/chromium/xstart.sh




# run script as chromium user
su -c "$1 && startx /home/chromium/xstart.sh $CURSOR $OUTPUT" - chromium
