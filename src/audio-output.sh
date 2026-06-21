#!/usr/bin/env bash
#
# Resolve AUDIO_OUTPUT_DEVICE (a friendly token) to an ALSA device and pin it as
# the default output by writing /etc/asound.conf. Sourced by start.sh.
#
# By default Chromium plays to ALSA's default device, which on multi-output
# hardware (e.g. an Intel NUC with both an analog jack and HDMI) is often not the
# output you want. Set AUDIO_OUTPUT_DEVICE to one of the tokens below; leave it
# unset (or 'auto') to keep the kernel/ALSA default.
#
#   hdmi           the first HDMI output
#   hdmi0..hdmi3   a specific HDMI output. Intel GPUs expose several HDMI
#                  converters regardless of how many ports exist, so check the
#                  diagnostics report to find which one your monitor is on.
#   analog | jack  the analog / headphone output
#   usb            a USB audio card
#   dac            an attached DAC
#
# To add a token, add a case to resolve_audio_device() that calls
# find_alsa_output with a keyword (a case-insensitive pattern matched against the
# `aplay -l` device list).

# Echo "hw:CARD,DEVICE" for the first playback device matching $1 in `aplay -l`.
# aplay -l prints one line per output, e.g.:
#   card 0: PCH [HDA Intel PCH], device 3: HDMI 0 [HDMI 0]
# so we grep for the keyword(s) and pull the card/device numbers out with sed.
find_alsa_output() {
    aplay -l 2>/dev/null \
        | grep -iE "$1" \
        | head -n1 \
        | sed -E 's/^card ([0-9]+): .* device ([0-9]+):.*/hw:\1,\2/'
}

resolve_audio_device() {
    local token; token=$(echo "$1" | tr 'A-Z' 'a-z')
    case "$token" in
        hdmi)                   find_alsa_output 'hdmi' ;;
        hdmi[0-9])              find_alsa_output "hdmi ${token#hdmi}" ;;
        analog|jack|headphones) find_alsa_output 'analog|headphone' ;;
        usb)                    find_alsa_output 'usb' ;;
        dac)                    find_alsa_output 'dac' ;;
        *)                      return 1 ;;
    esac
}

# Tokens are case-insensitive, so AUTO / HDMI / ANALOG (audio-block style) all work.
audio_token=$(echo "${AUDIO_OUTPUT_DEVICE:-}" | tr 'A-Z' 'a-z')
if [ -n "$audio_token" ] && [ "$audio_token" != "auto" ]; then
    audio_dev=$(resolve_audio_device "$audio_token") || true
    if [ -n "$audio_dev" ]; then
        cat > /etc/asound.conf <<EOF
pcm.!default {
    type plug
    slave.pcm "${audio_dev}"
}
EOF
        echo "Audio: AUDIO_OUTPUT_DEVICE='${AUDIO_OUTPUT_DEVICE}' -> ${audio_dev} (wrote /etc/asound.conf)"
    else
        echo "Audio: WARNING could not resolve AUDIO_OUTPUT_DEVICE='${AUDIO_OUTPUT_DEVICE}'; leaving ALSA default"
    fi
fi
