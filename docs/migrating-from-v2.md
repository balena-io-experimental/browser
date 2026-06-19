# Migrating from v2 to v3

v3 is a significant change to how the `browser` block runs. This guide covers what changed and what
you need to update. If you are starting fresh, you can ignore this document and follow the
[readme](../readme.md).

## 1. Wayland instead of X11 — the browser now needs a companion display block

In v2 the block ran its own X11 server and drew directly to the display. In v3 the block is a thin
**Wayland client**: it no longer starts a display server itself. You now run a separate
**display (compositor) block** alongside it, and the two share the Wayland socket through a volume.

At minimum your compose file must:

- add the display block as a service and `depends_on` it from `browser`;
- share a volume mounted at `/run` between the two so the browser can reach the Wayland socket;
- set `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY` on the browser service.

```yaml
volumes:
  display-socket:

services:
  display:
    image: bh.cr/balenalabs/display-<arch>   # companion compositor block; see its README for the image name
    privileged: true
    volumes:
      - display-socket:/run
    labels:
      io.balena.features.dbus: '1'

  browser:
    image: bh.cr/balenalabs/browser-<device-type>
    privileged: true
    depends_on:
      - display
    environment:
      XDG_RUNTIME_DIR: /run/user/0
      WAYLAND_DISPLAY: wayland-0
    devices:
      - /dev/dri:/dev/dri
    ports:
      - '5011:5011'
    volumes:
      - display-socket:/run
```

## 2. New image namespace: per device type, not per architecture

v2 published one image per architecture (`browser-aarch64`, `browser-amd64`, `browser-arm32`). v3
publishes one image **per device type**:

| v2 image | v3 image |
| --- | --- |
| `browser-aarch64` (Raspberry Pi 3) | `browser-raspberrypi3-64` |
| `browser-aarch64` (Raspberry Pi 4 / 400) | `browser-raspberrypi4-64` |
| `browser-aarch64` (Raspberry Pi 5) | `browser-raspberrypi5` |
| `browser-aarch64` (other 64-bit Arm) | `browser-generic-aarch64` |
| `browser-amd64` | `browser-generic-amd64` |

The reason is that the browser is a client whose build differs per target — most notably the
Raspberry Pi images use a Chromium built from the Raspberry Pi sources to get hardware video decode.
Update your `docker-compose.yml` to reference the image for your device type.

> 32-bit Raspberry Pi OS, the `arm32` images and the balena Fin (`fincm3`) are no longer built. Use
> the 64-bit (`aarch64`) OS on Raspberry Pi.

## 3. Hardware acceleration toggles

`ENABLE_GPU=1` still turns on GPU rendering **and** best-effort hardware video decode, so existing
video kiosks need no change. New in v3:

- **`DISABLE_VIDEO_DECODE=1`** — opt out of hardware video decode while keeping GPU rendering, for
  devices where the decode path misbehaves.
- Hardware **video encode** is not supported (see
  [#168](https://github.com/balena-io-experimental/browser/issues/168)).

See [Hardware acceleration](../readme.md#hardware-acceleration) for what to expect per device.

## 4. Custom `FLAGS` / `EXTRA_FLAGS`

If you overrode `FLAGS` or `EXTRA_FLAGS` in v2, review them. v3 renders through Wayland
(`--ozone-platform=wayland`), so X11-specific switches no longer apply, and the GPU/decode flags are
now chosen per device type by the block. Prefer the `ENABLE_GPU` / `DISABLE_VIDEO_DECODE` toggles over
hand-rolled flags where possible.

## 5. Diagnostics

The `/diagnostics/*` endpoints (Chromium version, GPU state, media-decoder state) are new in v3 and
are **off by default**. Set `ENABLE_DIAGNOSTICS=1` to enable them. See
[Diagnostics](../readme.md#diagnostics).

## 6. Remote debugging

In v2, mapping the remote debugging port did not actually make it reachable from another host —
Chromium binds that interface to localhost only. In v3 it is an explicit opt-in: set
`ENABLE_REMOTE_DEBUG=1` and map `REMOTE_DEBUG_PORT`. See
[Remote debugging](../readme.md#remote-debugging) for the security caveats.

## 7. Screen rotation & display geometry moved to the display block

In v2 the browser owned the screen — it ran its own X server and rotated the display with `xrandr`,
rotated touch input with `xinput`, and sized its own window. In v3 the **compositor (the display
block) owns the output**, so these settings move there. The following `browser` variables **no longer
exist**:

`ROTATE_DISPLAY`, `ROTATE_DELAY`, `TOUCHSCREEN`, `WINDOW_SIZE`, `WINDOW_POSITION`, `SHOW_CURSOR`,
`DISPLAY_NUM`.

Configure the equivalents on the **`display`** service instead:

| v2 (browser) | v3 (display block) |
| --- | --- |
| `ROTATE_DISPLAY=left` | `DISPLAY_ROTATION=270` (degrees **clockwise**: `left`→`270`, `right`→`90`, `inverted`→`180`) |
| `ROTATE_DELAY` | no longer needed — the compositor applies the transform at startup |
| `WINDOW_SIZE=1920,1080` | `DISPLAY_RESOLUTION=1920x1080` (in kiosk mode the client always fills the output) |
| `WINDOW_POSITION` | not applicable — the kiosk client is full-screen |
| `TOUCHSCREEN` | not needed — touch input follows the output transform automatically |
| `SHOW_CURSOR` | controlled by the compositor |

See the display block's README for the full list (`DISPLAY_ROTATION`, `DISPLAY_RESOLUTION`,
`DISPLAY_SCALE`). Note that `DISPLAY_ROTATION` uses **degrees clockwise** (`0`/`90`/`180`/`270`)
rather than v2's `left`/`right`/`inverted`.

Before (v2 — rotation on the browser):

```yaml
services:
  browser:
    image: bh.cr/balenalabs/browser-aarch64
    environment:
      ROTATE_DISPLAY: left
      WINDOW_SIZE: '1920,1080'
```

After (v3 — rotation on the display block):

```yaml
services:
  display:
    image: bh.cr/balenalabs/display-<arch>
    privileged: true
    volumes:
      - display-socket:/run
    labels:
      io.balena.features.dbus: '1'
    environment:
      DISPLAY_ROTATION: 270      # v2 "left" == 270 degrees clockwise
      DISPLAY_RESOLUTION: 1920x1080

  browser:
    image: bh.cr/balenalabs/browser-<device-type>
    # ... no rotation/geometry variables here anymore
```

> Multi-display setups are not yet supported by the display block; these variables apply to the
> first connected display.

## 8. Audio no longer pre-wired to the audio block

In v2 the browser image baked in the [`audio` block](https://github.com/balena-labs-projects/audio)
integration: the Dockerfile installed the PulseAudio ALSA bridge and set
`PULSE_SERVER=tcp:audio:4317`, so dropping the audio block into your compose file "just worked".

In v3 this is **removed**. The browser now plays audio **directly via ALSA** to the device's sound
hardware, with no extra container required — for most setups (HDMI sound, the 3.5mm jack) audio works
out of the box with no configuration.

### Retaining the audio block

If you relied on the audio block, you can opt back in, but you must now wire it up yourself by
extending the browser image. Add the ALSA→PulseAudio bridge and point it at the audio server (this is
exactly what the v2 image baked in):

```Dockerfile
FROM bh.cr/balenalabs/browser-<device-type>
# Route ALSA output to the audio block's PulseAudio server
RUN curl -skL https://raw.githubusercontent.com/balena-labs-projects/audio/master/scripts/alsa-bridge/debian-setup.sh | sh
ENV PULSE_SERVER=tcp:audio:4317
```

Then add the `audio` service alongside the (now locally built) browser service. In this example audio
is routed to the Raspberry Pi headphone jack via the audio block's `AUDIO_OUTPUT` variable:

```yaml
services:
  browser:
    build: .            # builds the extended Dockerfile above
    privileged: true
  audio:
    image: bh.cr/balenalabs/audio-<arch>
    privileged: true
    ports:
      - 4317:4317
    environment:
      AUDIO_OUTPUT: RPI_HEADPHONES
```

The `PULSE_SERVER` host must match the audio service name. It defaults to `audio`; if you rename the
service, update the env var accordingly (e.g. `ENV PULSE_SERVER=tcp:not-audio:4317`). See the audio
block's [environment variables](https://github.com/balena-labs-projects/audio#environment-variables)
for the full `AUDIO_OUTPUT` vocabulary (`RPI_HDMI0`, `RPI_HDMI1`, `DAC`, `USB`, `AUTO`, …).

> The `audio` block is **unmaintained** (no updates or testing in ~4 years). The supported, tested
> path is the default ALSA-direct one; use the audio block at your own risk. It is also the only way
> to get Bluetooth audio output, which the default ALSA-direct path does not support.
