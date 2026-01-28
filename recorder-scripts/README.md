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
| `PERSISTENT` | `1` | Enable persistent browser profile storage |
| `ROTATE_DISPLAY` | `left` | Rotate display (normal, left, right, inverted) |

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
