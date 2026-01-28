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

## How to Use

Place your recorder JSON file in this directory, then set these environment variables in balenaCloud:

```
ENABLE_RECORDER_SCRIPT=1
RECORDER_SCRIPT_PATH=/usr/src/app/recorder-scripts/your-script.json
```

## Credentials (Username/Password)

The recorder script automatically replaces username and password values at runtime using environment variables. This keeps your credentials secure and out of version control.

Set these environment variables in balenaCloud:

```
HA_USERNAME=your_username
HA_PASSWORD=your_password
```

The script detects fields based on their selectors (looking for "username" or "password" in the field selectors) and replaces the values automatically.

## Example Configuration

If you save a recording as `ha_login.json` in this directory:

```
ENABLE_RECORDER_SCRIPT=1
RECORDER_SCRIPT_PATH=/usr/src/app/recorder-scripts/ha_login.json
HA_USERNAME=your_actual_username
HA_PASSWORD=your_actual_password
```

## Toggle On/Off

- **Enable**: `ENABLE_RECORDER_SCRIPT=1`
- **Disable**: `ENABLE_RECORDER_SCRIPT=0`
