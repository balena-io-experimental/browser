#!/usr/bin/bash

# set the CPU Scaling governor to 'performance'
echo "Setting CPU Scaling Governor to 'performance'"
echo 'performance' > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor