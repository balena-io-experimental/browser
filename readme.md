# balena-labs-projects/browser

Provides a hardware accelerated web browser to present internal and external URLs on a connected display.
The `browser` block is a docker image that runs a [Chromium](https://www.chromium.org/Home) browser as a [Wayland](https://wayland.freedesktop.org/) client, optimized for balenaOS.
It renders through a companion **display** (compositor) block, and provides an API for dynamic configuration.

> **Upgrading from v2?** v3 moves from X11 to Wayland and changes the image namespace. See the
> [v2 → v3 migration guide](docs/migrating-from-v2.md).

---
## Features

- Chromium browser optimized for device arch
- Hardware video acceleration (if enabled)
- Optional KIOSK mode
- Remotely configurable launch URL
- Automatically displays local HTTP (port 80 or 8080) or HTTPS (443) service endpoints.
- API for remote configuration and management
- Optional remote debugging from another host
---

## Usage

The `browser` block renders through a companion **display** (compositor) block. Run both services,
share a volume mounted at `/run` so the browser can reach the Wayland socket, and reference the
`browser` image for your **device type** (one of `raspberrypi3-64`, `raspberrypi4-64`,
`raspberrypi5`, `generic-aarch64`, `generic-amd64`).

#### docker-compose file
To use this image, create your `docker-compose.yml` file as shown below:

```yaml
version: '2.4'

volumes:
  display-socket:                    # Shared Wayland runtime directory
  settings:                          # Only required if using PERSISTENT flag (see below)

services:

  display:
    image: bh.cr/balenalabs/display-<arch> # companion compositor block; see its README for the image name
    privileged: true
    volumes:
      - display-socket:/run
    labels:
      io.balena.features.dbus: '1'

  browser:
    image: bh.cr/balenalabs/browser-<device-type> # e.g. raspberrypi4-64, raspberrypi5, generic-amd64
    privileged: true # required for UDEV to find plugged in peripherals such as a USB mouse
    depends_on:
      - display
    environment:
      XDG_RUNTIME_DIR: /run/user/0
      WAYLAND_DISPLAY: wayland-0
    devices:
      - /dev/dri:/dev/dri
    ports:
      - '5011:5011' # management API
    volumes:
      - display-socket:/run
      - 'settings:/data' # Only required if using PERSISTENT flag (see below)
```

To pin to a specific [version](CHANGELOG.md) of this block, append the version to the image, e.g.
`bh.cr/balenalabs/browser-<device-type>/<version>`.

See [here](https://github.com/balena-io/open-balena-registry-proxy#usage) for more details about how to use blocks hosted in balenaCloud.

---

## Environment variables

The following environment variables allow configuration of the `browser` block:

| Environment variable | Options | Default | Description |
| --- | --- | --- | --- |
|`LAUNCH_URL`|`http` or `https` URL|N\A|Web page to display|
|`DISPLAY_NUM`|`n`|0|Display number to use|
|`LOCAL_HTTP_DELAY`|Number (seconds)|0|Number of seconds to wait for a local HTTP service to start before trying to detect it|
|`KIOSK`|`0`, `1`|`0`|Run in kiosk mode with no menus or status bars. <br/> `0` = off, `1` = on|
|`SHOW_CURSOR`|`0`, `1`|`0`|Enables/disables the cursor when in kiosk mode<br/> `0` = off, `1` = on|
|`FLAGS`|[many!](https://peter.sh/experiments/chromium-command-line-switches/)|N/A|**Replaces** the flags chromium is started with. Enter a space (\' \') separated list of flags (e.g. `--noerrdialogs --disable-session-crashed-bubble`) <br/> **Use with caution!**|
|`EXTRA_FLAGS`|[many!](https://peter.sh/experiments/chromium-command-line-switches/)|N/A|Adds **additional** flags chromium is started with. Enter a space (\' \') separated list of flags (e.g. `--audio-buffer-size=2048 --audio-output-channels=8`)|
|`PERSISTENT`|`0`, `1`|`0`|Enables/disables user profile data being stored on the device. **Note: you'll need to create a settings volume. See example above** <br/> `0` = off, `1` = on|
|`ROTATE_DISPLAY`|`normal`, `left`, `right`, `inverted`|`normal`|Rotates the display|
|`ROTATE_DELAY`|`n`|`3`|Add an artificial delay (in seconds) before applying display rotation|
|`TOUCHSCREEN`|`string`|N\A|Name of Touch Input to rotate|
|`ENABLE_GPU`|`0`, `1`|0|Master hardware-acceleration switch. Enables GPU **rendering** (rasterization, compositing, WebGL/canvas) and, by default, best-effort hardware **video decode**. On Raspberry Pi, decode is handled by the Pi-patched Chromium (verify via `MojoVideoDecoder`/`V4L2VideoDecoder` in `chrome://media-internals`); on x86 it enables the Mesa VA-API path. <br/> `0` = off, `1` = on|
|`DISABLE_VIDEO_DECODE`|`0`, `1`|0|Opt **out** of hardware video decode while keeping GPU rendering on. Use on devices where the decode path misbehaves. No effect unless `ENABLE_GPU=1`. <br/> `0` = decode stays on, `1` = decode off|
|`WINDOW_SIZE`|`x,y`|Detected screen resolution|Sets the browser window size, such as `800,600`. <br/> **Note:** Reverse the dimensions if you also rotate the display to `left` or `right` |
|`WINDOW_POSITION`|`x,y`|`0,0`|Specifies the browser window position on the screen|
|`API_PORT`|port number|5011|Specifies the port number the API runs on|
|`ENABLE_REMOTE_DEBUG`|`0`, `1`|`0`|Exposes Chromium's remote debugging interface on `REMOTE_DEBUG_PORT` so it can be reached from another host (see [Remote debugging](#remote-debugging)). **No authentication or encryption.** <br/> `0` = off, `1` = on|
|`REMOTE_DEBUG_PORT`|port number|35173|Port the remote debugging relay listens on when `ENABLE_REMOTE_DEBUG=1`. Has no effect otherwise|
|`AUTO_REFRESH`|interval|0 (disabled)|Specifies the number of seconds before the page automatically refreshes|
|`ENABLE_DIAGNOSTICS`|`0`, `1`|`0`|Enables the `/diagnostics/*` API endpoints, which expose Chromium version, GPU and media-decoder state. Off by default. <br/> `0` = off, `1` = on|

---

## Choosing what to display
If you want the `browser` to display a website, you can set the `LAUNCH_URL` as noted above. However, you can also drop the `browser` into a multicontainer app, and use it to display the (HTTP, port 80 or 8080, or HTTPS port 443) output of another service, such as a Grafana dashboard. The `browser` will automatically detect that a service is running a HTTP server  and display that. Just make sure that you don't set a `LAUNCH_URL` environment variable, as they take precedence. Example:

*docker-compose.yml*
```yaml
version: '2.1'
volumes:
  settings:
services:
  browser:
    restart: always
    image: bh.cr/balenalabs/browser-<device-type>
    privileged: true
    volumes:
      - 'settings:/data'
  grafana:
    restart: always
    build: ./grafana
    ports:
      - "80"
```
---

## Choosing audio output device
By default the `browser` block will output audio via HDMI. If you want to route audio through a different interface you can do it with the help of the [`audio` block]((https://github.com/balena-labs-projects/audio)). The `browser` block is pre-configured to use it if present so you only need to add it to your `docker-compose.yml` file and then use `AUDIO_OUTPUT` environment variable to select the desired output. Check out the `audio` block [documentation](https://github.com/balena-labs-projects/audio#environment-variables) to learn more about it.

In this example we add the `audio` block and route the `browser` audio to the Raspberry Pi headphone jack:

```yaml
services:
  browser:
    image: bh.cr/balenalabs/browser-<device-type>
  audio:
    image: bh.cr/balenalabs/audio-<arch>
    privileged: true
    ports:
      - 4317:4317
    environment:
      AUDIO_OUTPUT: RPI_HEADPHONES
```

**Note**: The `browser` block expects the `audio` block to be named as such. If you change it's service name you'll need to override the `PULSE_SERVER` environment variable value to match it in the `browser` dockerfile. For example add `ENV PULSE_SERVER=tcp:not-audio:4317`.

---

## API
The `browser` block exposes an HTTP API running on port 5011. The following endpoints are available:

#### **GET** /ping
Returns HTTP 200 if the `browser` block is ready

#### **POST** /refresh
Refreshes the currently displayed page

#### **POST** /autorefresh/{interval}
Automatically refreshes the browser window

| Value | Description |
|--------------|-------------|
| 0 | disable |
| 1-60 | refresh every `interval` seconds |

#### **POST** /scan
Re-scans the device to find local HTTP or HTTPS services to display. This can be used by the HTTP/S service to notify the `browser` block that it is ready to be displayed, should there be a startup race.

<small><b><i>note:</i></b> *the* `LAUNCH_URL` *must not be set for local services to be detected.*</small>

#### **GET** /url
Returns the URL currently being displayed

#### **POST** /url
Sets the URL to be displayed. The URL is set in the request body. Example:

```bash
curl -X POST --data "url=www.balena.io" http://localhost:5011/url
```

You can also pre-set the kiosk and GPU settings as part of a URL put request. Example:

```bash
curl --data "url=www.balena.io&gpu=0&kiosk=1" http://localhost:5011/url
```

#### **GET** /gpu
Returns the status of the GPU:

| Return Value | Description |
|--------------|-------------|
| 0 | disabled |
| 1 | enabled |

#### **PUT** /gpu/{value}
Enables or disables the GPU

| Value | Description |
|--------------|-------------|
| 0 | disable |
| 1 | enable |

#### **GET** /kiosk
Returns whether the device is running kiosk mode or not:

| Return Value | Description |
|--------------|-------------|
| 0 | disabled |
| 1 | enabled |

#### **PUT** /kiosk/{value}
Enables or disables kiosk mode

| Value | Description |
|--------------|-------------|
| 0 | disable |
| 1 | enable |

#### **GET** /flags
Returns the flags Chromium was started with

#### **GET** /version
Returns the version of Chromium that `browser` is running

#### **GET** /screenshot
Uses [scrot](https://opensource.com/article/17/11/taking-screen-captures-linux-command-line-scrot) to take a screenshot of the chromium window. 
The screenshot will be saved as a temporary file in the container.

### Diagnostics

The following endpoints expose internal Chromium state for troubleshooting hardware acceleration.
They are **disabled by default**; set `ENABLE_DIAGNOSTICS=1` to enable them. When disabled they
return `404`. While enabled, Chromium also logs to `/tmp/chrome_debug.log` in the container so its
GPU/decoder/audio errors can be included in the report below.

#### **GET** /diagnostics/report
Returns a single, human-readable `.txt` bundling device/host info, runtime config and flags, Chromium
/ GPU / media state, and recent block + Chromium logs. This is the easiest thing to attach to a bug
report. Save it with:

```bash
curl -OJ http://<device-ip>:5011/diagnostics/report
```

#### **GET** /diagnostics/version
Returns the running Chromium build/version (and the block version) as JSON.

#### **GET** /diagnostics/gpu
Returns Chromium's GPU feature status, drivers and active backend as JSON (the same data as
`chrome://gpu`).

#### **GET** /diagnostics/media
Returns the decoder used by any active media player, including whether it is hardware-accelerated —
useful for confirming hardware video decode (e.g. `V4L2VideoDecoder`).

---

## Remote debugging

Chromium's DevTools endpoint binds to localhost only and ignores `--remote-debugging-address`
outside headless mode, so mapping the port alone does not make it reachable from another machine.
Set `ENABLE_REMOTE_DEBUG=1` to run a small TCP relay that forwards `REMOTE_DEBUG_PORT` (default
`35173`) to Chromium, and map that port in your compose file:

```yaml
    ports:
      - '5011:5011'
      - '35173:35173'
```

Then add the device as a target in `chrome://inspect/#devices` on another machine, connecting by IP
address (`<device-ip>:35173`).

> ⚠️ The remote debugging interface has **no authentication or encryption** — anyone who can reach
> the port gets full control of the browser. Only enable it on a trusted/private network, or leave
> the port unmapped and reach it through an SSH tunnel instead.

---

## Supported devices

The block builds for two architectures (`aarch64`, `amd64`) and bundles the Mesa
GPU/VA-API drivers, so it will *run* on a wide range of hardware. We distinguish two levels of
support:

**Tested** — exercised on real hardware, including hardware video decode where applicable:

| Device Type | Notes |
| --- | --- |
| Raspberry Pi 3 (64-bit OS) | H.264 hardware decode |
| Raspberry Pi 4 / Pi 400 | H.264 hardware decode |
| Raspberry Pi 5 | GPU rendering; H.264 falls back to software decode |
| Intel NUC | VA-API hardware decode (Mesa) |
| Generic AMD64 | VA-API hardware decode (Mesa) |
| Generic AARCH64 | GPU rendering; software video decode |

**Technically supported** — other devices of the same architecture should boot and render, but we
haven't validated them and hardware video decode is not guaranteed (it depends on the device's
kernel drivers). Use the generic `aarch64`/`amd64` images.

> **Note:** 32-bit Raspberry Pi OS and the balena Fin (`fincm3`) are no longer targeted. Use the
> 64-bit (`aarch64`) OS on Raspberry Pi.

---

## Hardware acceleration

Hardware acceleration is controlled by a single master switch with one optional override:

- **`ENABLE_GPU=1`** turns on GPU rendering **and** best-effort hardware video decode. For most
  kiosks (including video playback) this is the only variable you need.
- **`DISABLE_VIDEO_DECODE=1`** opts out of decode while keeping GPU rendering — for devices where the
  decode path misbehaves.

The prefix tells you the default: `ENABLE_*` is off until you set it; `DISABLE_*` is on until you set
it.

> **Upgrade note:** `ENABLE_GPU=1` continues to give you hardware video decode, as it always has —
> nothing to change for existing video kiosks.
>
> Hardware **video encode** is currently **not supported** (e.g. WebRTC capture/streaming may not
> work — see [#168](https://github.com/balena-io-experimental/browser/issues/168)).

What to expect per target (with `ENABLE_GPU=1`):

- **Raspberry Pi 4 / Pi 400 / Pi 3 (64-bit)** — H.264 hardware decode via the Pi-patched Chromium
  (`bcm2835-codec`). Verify in `chrome://media-internals`: the decoder shows as `V4L2VideoDecoder`
  with `isHardwareAccelerated: true`.
- **Raspberry Pi 5** — the video block is HEVC-only and the distro Chromium ships without proprietary
  codecs, so H.264 falls back to **software decode**. GPU rendering still works.
- **Generic x86_64 (Intel/AMD)** — VA-API decode via `mesa-va-drivers` (already bundled).
- **Generic AARCH64** — software video decode (no guaranteed kernel decoder).

## Troubleshooting
This section provides some guidance for common issues encountered:

#### Black border on HDMI display
Thanks to 1980's CRT televisions, manufacturers had to invent a method for cutting off the edges of a picture to ensure the "important" bits were displayed nicely on the screen. This is called `overscan` and there's a good article on it [here](https://www.howtogeek.com/252193/hdtv-overscan-what-it-is-and-why-you-should-probably-turn-it-off/).
If, when you plug one of the supported devices into your HDMI screen, you find black borders around the picture, you need to disable overscan. For the device this can be achieved by setting a [Device Configuration variable](https://www.balena.io/docs/learn/manage/configuration/#:~:text=Define%20fleet%2Dwide%3A-,Managing%20device%20configuration%20variables,of%20the%20device%20configuration%20variable.) called `BALENA_HOST_CONFIG_disable_overscan` and setting the value to `1`:

![overscan-setting](https://i.ibb.co/sCQ8Dwy/Capture.jpg)

You may also need to turn it off on the screen itself (check your device instructions for details).

#### Partial/strange display output
Occasionally users report weird things are happening with their display output like:
* Only a portion of the browser screen appears on their display
* The screen is displaying skewed or fragmented
* Colors have changed dramatically

Here are some things to try:
* Setting the WINDOW_SIZE manually to your display's resolution (e.g. `1980,1080`) - the display may be mis-reporting it's resolution to the device
* Increase the memory being allocated to the GPU with the Device Configuration tab on the dashboard, or via [configuration variable](https://www.balena.io/docs/learn/manage/configuration/) - for large displays the device may need to allocate more memory to displaying the output

