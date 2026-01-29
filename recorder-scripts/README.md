# Chrome Recorder Scripts

This directory contains Chrome Recorder scripts that can be automatically executed after the browser loads.

## How to Create a Recorder Script

1. Open Chrome DevTools (F12)
2. Go to the **Recorder** tab
3. Click **"Create a new recording"**
4. Name your recording
5. Click **Start recording**
6. Perform your actions (clicks, typing, navigation, etc.)
7. Click **End recording**
8. Click the **Export** button
9. Select **"Export as a JSON file"** or **"@puppeteer/replay"**
10. Save the file to this directory (e.g., `my-recording.json`)

## How to Set Environment Variables in balenaCloud

1. **Log in to balenaCloud** (balena.io)
2. **Navigate to your Fleet** (or specific Device)
3. Click on **"Variables"** in the left sidebar
4. Click **"Add Variable"**
5. Enter the variable name and value from the table below
6. Click **"Add"**
7. Repeat for each variable you need

### Fleet vs Device Variables:
- **Fleet Variable**: Applies to ALL devices in the fleet
- **Device Variable**: Applies to one specific device only

For settings like `KIOSK` and `ENABLE_RECORDER_SCRIPT`, use **Fleet Variables**.
For credentials that differ per device, use **Device Variables**.

## Environment Variables Reference

### Required for Recorder Script

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `ENABLE_RECORDER_SCRIPT` | `1` | Enable auto-login script execution |
| `RECORDER_SCRIPT_PATH` | `/usr/src/app/recorder-scripts/ha_login.json` | Path to your recorder script file |
| `HA_USERNAME` | `your_username` | Username for login (replaces placeholder in script) |
| `HA_PASSWORD` | `your_password` | Password for login (replaces placeholder in script) |

### Browser Configuration

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `KIOSK` | `1` | Enable kiosk mode (hides address bar, tabs, browser UI) |
| `LAUNCH_URL` | `http://10.0.0.78:8123` | Initial URL to load |
| `ENABLE_GPU` | `1` | Enable GPU acceleration (recommended for Raspberry Pi) |
| `WINDOW_SIZE` | `1920,1080` | Browser window size (width,height) |
| `SHOW_CURSOR` | `1` | Show cursor in kiosk mode (0=hide, 1=show) |

### Optional Advanced Settings

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `AUTO_REFRESH` | `3600` | Auto-refresh interval in seconds (0=disabled) |
| `PERSISTENT` | `1` | Enable persistent browser profile storage (cookies, cache, sessions) |
| `ROTATE_DISPLAY` | `left` | Rotate display (normal, left, right, inverted) |
| `ROTATE_DELAY` | `3` | Delay in seconds before applying display rotation |
| `TOUCHSCREEN` | `device_name` | Name of specific touch input device to rotate with display |
| `WINDOW_POSITION` | `100,100` | Browser window position on screen (x,y coordinates) |
| `DISPLAY_NUM` | `0` | Display number to use (for multi-monitor setups) |

### API & Debugging

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `API_PORT` | `5011` | Port for the browser control REST API |
| `REMOTE_DEBUG_PORT` | `35173` | Port for Chrome DevTools remote debugging |

### Advanced Chromium Flags

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `EXTRA_FLAGS` | `--audio-buffer-size=2048` | Adds additional Chromium flags (space-separated) without replacing defaults |
| `FLAGS` | `--noerrdialogs --disable-gpu` | ⚠️ **Replaces** all Chromium flags (use with caution!) |
| `FORCE_VULKAN` | `0`, `1`, or undefined | Force Vulkan on/off (undefined=auto-enable on Pi5 only) |

### Startup Control

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `LOCAL_HTTP_DELAY` | `5` | Seconds to wait for local HTTP service before auto-detecting URL |

## Complete Example Configuration

For a Home Assistant kiosk display with auto-login:

```bash
# Kiosk Mode
KIOSK=1
SHOW_CURSOR=0

# Display Settings
LAUNCH_URL=http://10.0.0.78:8123
WINDOW_SIZE=1920,1080
ENABLE_GPU=1

# Auto-Login Recorder Script
ENABLE_RECORDER_SCRIPT=1
RECORDER_SCRIPT_PATH=/usr/src/app/recorder-scripts/ha_login.json
HA_USERNAME=guest
HA_PASSWORD=guest
```

## Credentials Security

The recorder script automatically replaces username and password values at runtime using environment variables. This keeps your credentials secure and out of version control.

**How it works:**
- The script detects fields based on their selectors (looking for "username" or "password")
- Replaces placeholder values with your `HA_USERNAME` and `HA_PASSWORD` environment variables
- Credentials never stored in the JSON file or git repository

## Toggle Recorder Script On/Off

- **Enable**: `ENABLE_RECORDER_SCRIPT=1`
- **Disable**: `ENABLE_RECORDER_SCRIPT=0`

After adding/changing variables, the container will automatically restart with the new settings!

## Browser Control REST API

The browser exposes a REST API for runtime control (default port 5011). You can change the URL, refresh the page, take screenshots, and more without restarting the container.

### Available Endpoints

| Endpoint | Method | Description | Example |
|----------|--------|-------------|---------|
| `/ping` | GET | Health check | `curl http://localhost:5011/ping` |
| `/url` | GET | Get current URL | `curl http://localhost:5011/url` |
| `/url` | POST | Set new URL | `curl -X POST -H "Content-Type: application/json" -d '{"url":"http://example.com"}' http://localhost:5011/url` |
| `/refresh` | POST | Refresh current page | `curl -X POST http://localhost:5011/refresh` |
| `/gpu` | GET | Get GPU status | `curl http://localhost:5011/gpu` |
| `/gpu/:value` | POST | Enable/disable GPU | `curl -X POST http://localhost:5011/gpu/1` |
| `/kiosk` | GET | Get kiosk mode status | `curl http://localhost:5011/kiosk` |
| `/kiosk/:value` | POST | Enable/disable kiosk | `curl -X POST http://localhost:5011/kiosk/1` |
| `/flags` | GET | View current Chromium flags | `curl http://localhost:5011/flags` |
| `/version` | GET | Get Chromium version | `curl http://localhost:5011/version` |
| `/screenshot` | GET | Take screenshot (returns PNG) | `curl http://localhost:5011/screenshot > screen.png` |
| `/autorefresh/:interval` | POST | Set auto-refresh interval | `curl -X POST http://localhost:5011/autorefresh/300` |
| `/scan` | POST | Rescan for local HTTP services | `curl -X POST http://localhost:5011/scan` |

### Example: Change URL Dynamically

```bash
# From inside the container or another service
curl -X POST -H "Content-Type: application/json" \
  -d '{"url":"http://10.0.0.78:8123/lovelace/dashboard"}' \
  http://localhost:5011/url

# From your local machine (if device has public URL)
curl -X POST -H "Content-Type: application/json" \
  -d '{"url":"http://10.0.0.78:8123"}' \
  http://my-device.local:5011/url
```

### Chrome Remote Debugging

Access Chrome DevTools remotely on port 35173 (or your custom `REMOTE_DEBUG_PORT`):

1. Open Chrome on your computer
2. Navigate to: `chrome://inspect`
3. Click "Configure" and add: `your-device-ip:35173`
4. Your browser instance will appear under "Remote Target"
5. Click "inspect" to debug remotely
