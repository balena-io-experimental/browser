#!/usr/bin/env bash

function reverse_window_coordinates () {
  local INPUT=$1

  IFS=', ' read -a coords <<< $INPUT
  if [ ${#coords[@]} -eq 2 ]; then
    echo "${coords[1]},${coords[0]}"
  else
    echo "Screen coordinates not set correctly, so cannot reverse them."
  fi 
}

PULSE_SERVER=${PULSE_SERVER:-tcp:audio:4317}
export PULSE_SERVER=$PULSE_SERVER

export WINDOW_SIZE=$( cat /sys/class/graphics/fb0/virtual_size )

export DISABLE_V8_COMPILE_CACHE=1

# rotate screen if env variable is set [normal, inverted, left or right]
if [[ ! -z "$ROTATE_DISPLAY" ]]; then
  sleep 3 && xrandr -o $ROTATE_DISPLAY

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

# Set chromium version into an EnVar for later
export VERSION=`chromium-browser --version`

xset s off -dpms

node /usr/src/app/server.js