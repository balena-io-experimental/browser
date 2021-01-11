# balenablocks/browser

Provides a hardware accelerated web browser to present internal and external URLs on a connected display.
The `browser` block is a docker image that runs a [Chromium](https://www.chromium.org/Home) browser via X11, optimized for balenaOS.

---
## Features

- Chromium browser optimized for device arch
- Hardware video acceleration (if enabled)
- Optional KIOSK mode
- Remotely configurable launch URL
- Automatically displays local HTTP (port 80 or 8080) or HTTPS (443) service endpoints.
- API for remote configuration and management
- Chromium remote debugging port
---

## Usage

#### docker-compose file
To use this image, create a container in your `docker-compose.yml` file as shown below:

```yaml
version: '2'

volumes:
  settings:                          # Only required if using PERSISTENT flag (see below)

services:

  browser:
    image: balenablocks/browser:raspberrypi4-64
    privileged: true # required for UDEV to find plugged in peripherals such as a USB mouse
    network_mode: host
    ports:
        - '5011' # management API (optional)
        - '35173' # Chromium debugging port (optional)
    volumes:
      - 'settings:/data' # Only required if using PERSISTENT flag (see below)
```

You can also set your `docker-compose.yml` to build a `dockerfile.template` file, and use the build variable `%%BALENA_MACHINE_NAME%%` so that the correct image is automatically built for your device type (see [supported devices](#Supported-devices)):

*docker-compose.yml:*
```yaml
version: '2'

volumes:
  settings:                          # Only required if using PERSISTENT flag (see below)

services:

  browser:
    build: ./
    privileged: true # required for UDEV to find plugged in peripherals such as a USB mouse
    network_mode: host
    ports:
        - '5011' # management API (optional)
        - '35173' # Chromium debugging port (optional)
    volumes:
      - 'settings:/data' # Only required if using PERSISTENT flag (see below)
```
*dockerfile.template*

```dockerfile
FROM balenablocks/browser:%%BALENA_MACHINE_NAME%%
```
---

## Customization
### Extend image configuration

By default the `browser` block uses the first local display (i.e. `DISPLAY=:0`) which would typically be a connected monitor, TV or a Pi Display. However for custom configurations you can overload the `CMD` directive, as such:

*dockerfile.template*
```Dockerfile
FROM balenablocks/browser:%%BALENA_MACHINE_NAME%%

CMD ["export DISPLAY=:1"]
```
---

### Environment variables

The following environment variables allow configuration of the `browser` block:

| Environment variable | Options | Default | Description |
| --- | --- | --- | --- |
|`LAUNCH_URL`|`http` or `https` URL|N\A|Web page to display|
|`LOCAL_HTTP_DELAY`|Number (seconds)|0|Number of seconds to wait for a local HTTP service to start before trying to detect it|
|`KIOSK`|`0`, `1`|`0`|Run in kiosk mode with no menus or status bars. <br/> `0` = off, `1` = on|
|`SHOW_CURSOR`|`0`, `1`|`0`|Enables/disables the cursor when in kiosk mode<br/> `0` = off, `1` = on|
|`FLAGS`|[many!](https://peter.sh/experiments/chromium-command-line-switches/)|N/A|Overrides the flags chromium is started with. **Use with caution!**|
|`PERSISTENT`|`0`, `1`|`0`|Enables/disables user profile data being stored on the device. **Note: you'll need to create a settings volume. See example above** <br/> `0` = off, `1` = on|
|`ROTATE_DISPLAY`|`normal`, `left`, `right`, `inverted`|`normal`|Rotates the display|
|`ENABLE_GPU`|`0`, `1`|0|Enables the GPU rendering. Necessary for Pi3B+ to display YouTube videos. <br/> `0` = off, `1` = on|
|`WINDOW_SIZE`|`x,y`|Detected screen resolution|Sets the browser window size, such as `800,600`|
|`WINDOW_POSITION`|`x,y`|`0,0`|Specifies the browser window position on the screen|

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
    image: balenablocks/browser:raspberrypi4-64
    network_mode: host
    privileged: true
    volumes:
      - 'settings:/data'
  grafana:
    restart: always
    build: ./grafana
    network_mode: host
    ports:
      - "80"
```
---

## Choosing audio output device
By default the `browser` block will output audio via HDMI. If you want to route audio through a different interface you can do it with the help of the [`audio` block]((https://github.com/balenablocks/audio)). The `browser` block is pre-configured to use it if present so you only need to add it to your `docker-compose.yml` file and then use `AUDIO_OUTPUT` environment variable to select the desired output. Check out the `audio` block [documentation](https://github.com/balenablocks/audio#environment-variables) to learn more about it.

In this example we add the `audio` block and route the `browser` audio to the Raspberry Pi headphone jack:

```yaml
services:
  browser:
    image: balenablocks/browser:raspberrypi4-64
    network_mode: host
  audio:
    image: balenablocks/audio:raspberrypi4-64
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

#### **POST** /scan
Re-scans the device to find local HTTP or HTTPS services to display. This can be used by the HTTP/S service to notify the `browser` block that it is ready to be displayed, should there be a startup race.

<small><b><i>note:</i></b> *the* `LAUNCH_URL` *must not be set for local services to be detected.*</small>

#### **GET** /url
Returns the URL currently being displayed

#### **PUT** /url
Sets the URL to be displayed. The URL is set in the request body. Example:

```bash
curl --data "url=www.balena.io" http://localhost:5011/url
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
---

## Supported devices
The `browser` block has been tested to work on the following devices:

| Device Type  | Status |
| ------------- | ------------- |
| Raspberry Pi 3b+ | ✔ |
| Raspberry Pi 3b+ (64-bit OS) | ✔ |
| balena Fin | ✔ |
| Raspberry Pi 4 | ✔ |
| Intel NUC | ✔ |
| Generic AMD64 | ✔ |
---

## Troubleshooting
This section provides some guidance for common issues encountered:

#### Black border on HDMI display
Thanks to 1980's CRT televisions, manufacturers had to invent a method for cutting off the edges of a picture to ensure the "important" bits were displayed nicely on the screen. This is called `overscan` and there's a good article on it [here](https://www.howtogeek.com/252193/hdtv-overscan-what-it-is-and-why-you-should-probably-turn-it-off/).
If, when you plug one of the supported devices into your HDMI screen, you find black borders around the picture, you need to disable overscan. For the device this can be achieved by setting a [Device Configuration variable](https://www.balena.io/docs/learn/manage/configuration/#:~:text=Define%20fleet%2Dwide%3A-,Managing%20device%20configuration%20variables,of%20the%20device%20configuration%20variable.) called `BALENA_HOST_CONFIG_disable_overscan` and setting the value to `1`:

![overscan-setting](https://i.ibb.co/sCQ8Dwy/Capture.jpg)

You may also need to turn it off on the screen itself (check your device instructions for details).

#### Partial display output
Occasionally users report that only a portion of the browser screen appears on their display. The things to try here are:

* Setting the WINDOW_SIZE manually to your display's resolution (e.g. `1980,1080`) - the display may be mis-reporting it's resolution to the device
* Increase the memory being allocated to the GPU with the [configuration variable](https://www.balena.io/docs/learn/manage/configuration/) - for large displays the device may need to allocate more memory to displaying the output
