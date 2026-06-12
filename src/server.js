#!/bin/env node

/**
 * balena Browser Block - Wayland Sidecar Architecture
 * This service acts as a thin Wayland client, launching Chromium via chrome-launcher
 * and connecting to a separately-deployed display block via a shared Unix socket.
 * It exposes an Express API on port 5011 for dynamic configuration at runtime.
 */

const express = require('express');
const bodyParser = require('body-parser');
const chromeLauncher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const bent = require('bent');
const {
  setIntervalAsync,
  clearIntervalAsync
} = require('set-interval-async/dynamic');
const path = require('path');
const os = require('os');

// Static environment variable fallback configurations
const API_PORT = parseInt(process.env.API_PORT) || 5011;
const PERSISTENT_DATA = process.env.PERSISTENT || '0';
const REMOTE_DEBUG_PORT = process.env.REMOTE_DEBUG_PORT || 35173;
const FLAGS = process.env.FLAGS || null;
const EXTRA_FLAGS = process.env.EXTRA_FLAGS || null;
const HTTPS_REGEX = /^https?:\/\//i;
const AUTO_REFRESH = process.env.AUTO_REFRESH || 0;
const FORCE_VULKAN = process.env.FORCE_VULKAN || "-1";

// Dynamic configuration variables that can be altered live via the HTTP API
let kioskMode = process.env.KIOSK || '0';
let enableGpu = process.env.ENABLE_GPU || '0';

let DEFAULT_FLAGS = [];
let currentUrl = '';
let flags = [];
let timer = {};

/**
 * Resolves the target URL for Chromium to display based on a strict hierarchy:
 * - Explicitly defined LAUNCH_URL environment variable.
 * - Discovered local HTTP/S services (e.g., Grafana, Node-RED running on adjacent containers).
 * - Fallback to a static local HTML splash page.
 */
async function getUrlToDisplayAsync() {
  let launchUrl = process.env.LAUNCH_URL || null;
  
  if (null !== launchUrl) {
    console.log(`Using LAUNCH_URL: ${launchUrl}`);
    // Prepend protocol if missing; required for Chromium's --app flag to parse the URL correctly
    if (!HTTPS_REGEX.test(launchUrl)) {
      launchUrl = `http://${launchUrl}`;
    }
    return launchUrl;
  }

  console.log("LAUNCH_URL environment variable not set. Looking for local HTTP/S services.");

  let ports = [80, 443, 8080];
  let returnURL = null;
  let urls = [];

  // Probe common local ports to automatically surface adjacent container web interfaces
  for await (const port of ports) {
    const protocol = 443 === port ? `https` : `http`;
    const url = `${protocol}://localhost:${port}`;
    try {
      const request = bent(url);
      const response = await request();
      console.log(`Trying local port ${port}`);
      if (200 == response.statusCode) {
        console.log("HTTP/S service found at: " + url);
        urls.push(url);
      }
    } catch(e) {
      console.log(`No service found on port ${port}`);
    }
  }

  if (urls.length > 0) {
    returnURL = urls[0];
  } else {
    console.log("Displaying default HTML page");
    returnURL = "file:///home/chromium/index.html";
  }

  return returnURL;
}

/**
 * Composes hardware-specific flags and spawns Chromium using wayland.
 * Manages the destruction of previous instances before launching a new session.
 */
let launchChromium = async function(url) {
  await chromeLauncher.killAll();

  flags = [];
  if (null !== FLAGS) {
    // Override completely if the user provides an explicit global FLAGS variable
    flags = FLAGS.split(' ');
  } else {
    flags = DEFAULT_FLAGS;
    
    // Universal Wayland and kiosk-oriented behavior flags
    let balenaFlags = [
      '--autoplay-policy=no-user-gesture-required', // Allow autonomous media playback
      '--noerrdialogs',                             // Suppress error dialogs in production
      '--disable-session-crashed-bubble',           // Prevent crash recovery UI from breaking kiosk immersion
      '--check-for-update-interval=31536000',       // Disable update checks
      '--disable-dev-shm-usage',                    // Prevent shared memory exhaustion in Docker
      '--touch-events=enabled'                      // Force capacitive touch layer recognition for DSI displays
    ];

    flags = flags.concat(balenaFlags);

    // Feature toggles combined into a single comma-separated string to prevent CLI argument collisions
    let enabledFeatures = [];
    let gpuFlags = [];

    if (process.env.ENABLE_VIRTUAL_KEYBOARD === '1') {
      enabledFeatures.push('VirtualKeyboard');
    }

    if (enableGpu != '1') {
      console.log("GPU Acceleration Disabled. Engaging clean software rasterization.");
      // Forces a CPU-driven software rasterization pipeline compatible with Wayland/Weston allocation
      gpuFlags = [
        '--ozone-platform=wayland',
        '--use-gl=swiftshader'
      ];
    } else {
      console.log("Enabling Hardware GPU Acceleration Pipeline");
      
      // Baseline Wayland GPU acceleration parameters
      gpuFlags = [
        '--ozone-platform=wayland',    // Instruct Chromium to bypass X11/XWayland
        '--ignore-gpu-blocklist',      // Override default driver blacklists for embedded Mesa drivers
        '--enable-gpu-rasterization',  // Offload UI and canvas rendering to the GPU
        // '--enable-zero-copy'           // Prevent expensive CPU memory copies by directly mapping GPU textures
      ];
      
      const deviceType = process.env.BALENA_DEVICE_TYPE || '';
      const deviceArch = process.env.BALENA_DEVICE_ARCH || '';

      // Handle configuration routing based on targeted system architectures
      
      // Raspberry Pi Architecture (Broadcom VideoCore)
      if (deviceType.startsWith('raspberry')) {
        // Map ANGLE to OpenGL ES native to the Broadcom VideoCore GPU
        gpuFlags.push('--use-angle=gles');
        // Engage hardware video engine parameters
        enabledFeatures.push('V4l2VideoDecoder', 'AcceleratedVideoEncoder');

        // Pi 5 specific Vulkan enablement using the v3dv Mesa driver
        if (FORCE_VULKAN === "1" || (deviceType === "raspberrypi5" && FORCE_VULKAN !== "0")) {
          enabledFeatures.push('Vulkan');
        }
      } 
      // Generic x86_64 Architecture (Intel / AMD Radeon)
      else if (deviceArch === 'amd64') {
        // Map directly to standard EGL on standard x86 graphics stacks
        gpuFlags.push('--use-gl=egl');
        // Engage VA-API hardware decoders specifically optimized for Linux Wayland environments
        enabledFeatures.push('AcceleratedVideoDecodeLinuxGL', 'AcceleratedVideoDecodeLinuxZeroCopyGL');
      } 
      // Generic AARCH64 Architecture
      else if (deviceArch === 'aarch64') {
        // Safe fallback for disparate ARM64 boards lacking guaranteed V4L2 decoder compatibility
        gpuFlags.push('--use-gl=egl');
      }
    }

    // Register all collected features into the unified argument flag
    flags = flags.concat(gpuFlags);
    flags.push(`--enable-features=${enabledFeatures.join(',')}`);
  }

  // Append any additive custom flags provided by the operator
  if (EXTRA_FLAGS) {
    flags = flags.concat(EXTRA_FLAGS.split(' '));
  }

  let startingUrl = url;
  if ('1' === kioskMode) {
    console.log("Enabling KIOSK mode");
    // The --app flag strips the URL bar and browser frame UI
    startingUrl = `--app=${url}`;
  } else {
    console.log("Disabling KIOSK mode");
  }

  console.log(`Starting Chromium with flags: ${flags.join(' ')}`);
  console.log(`Displaying URL: ${startingUrl}`);

  // Launching the client. Note that Chromium's internal sandbox is retained for security.
  const chrome = await chromeLauncher.launch({
    startingUrl: startingUrl,
    ignoreDefaultFlags: true,
    chromeFlags: flags,
    port: REMOTE_DEBUG_PORT,
    connectionPollInterval: 1000,
    maxConnectionRetries: 120,
    userDataDir: '1' === PERSISTENT_DATA ? '/data/chromium' : undefined
  });
    
  console.log(`Chromium remote debugging tools running on port: ${chrome.port}`);
  currentUrl = url;
}

/**
 * Executes a page reload via the Chrome DevTools Protocol.
 * Falls back to a hard process relaunch if the debugger socket is unavailable.
 */
async function refreshPageCDP() {
  let client;
  try {
    client = await CDP({ port: REMOTE_DEBUG_PORT });
    const { Page } = client;
    await Page.enable();
    await Page.reload();
    console.log('CDP page refresh executed.');
  } catch (err) {
    console.log('CDP connection failed during refresh, falling back to full relaunch.', err.toString());
    await launchChromium(currentUrl);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Executes a seamless URL navigation via the Chrome DevTools Protocol.
 * Prevents unnecessary tearing and process destruction when only the target URL changes.
 */
async function navigatePageCDP(url) {
  let client;
  try {
    client = await CDP({ port: REMOTE_DEBUG_PORT });
    const { Page } = client;
    await Page.enable();
    await Page.navigate({ url: url });
    currentUrl = url;
    console.log(`CDP navigation to: ${url}`);
  } catch (err) {
    console.log('CDP connection failed during navigation, falling back to full relaunch.', err.toString());
    await launchChromium(url);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Retrieves chrome-launcher's internal default flags, filtering out 
 * developer extensions and audio muting to ensure standard kiosk functionality.
 */
async function SetDefaultFlags() {
  DEFAULT_FLAGS = await chromeLauncher.Launcher.defaultFlags().filter(
    flag => '--disable-extensions' !== flag && '--mute-audio' !== flag
  );
}

/**
 * Initializes the asynchronous interval timer for automated page refreshes.
 */
async function setTimer(interval) {
  console.log("Auto refresh interval: ", interval);
  timer = setIntervalAsync(
    async () => {
      try {
        await refreshPageCDP();
      } catch (err) {
        console.log("Timer error: ", err);
        process.exit(1);
      }
    },
    interval
  );
}

/**
 * Halts the currently active automated refresh timer loop.
 */
async function clearTimer(){
  await clearIntervalAsync(timer);
}

/**
 * Primary execution entrypoint loop initialization.
 */
async function main(){
  await SetDefaultFlags();
  let url = await getUrlToDisplayAsync();
  await launchChromium(url);
  if (AUTO_REFRESH > 0) {
    await setTimer(AUTO_REFRESH * 1000);
  }
}

main().catch(err => {
  console.log("Main error: ", err);
  process.exit(1);
});

// ============================================================================
// Express HTTP API Routes
// Exposes endpoints for managing the Chromium Wayland client state dynamically
// ============================================================================

const app = express();

const errorHandler = (err, req, res, next) => {
  res.status(500);
  res.render('API error: ', {
    error: err
  });
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.use(errorHandler);

// Readiness probe for supervisor health checks
app.get('/ping', (req, res) => {
  return res.status(200).send('ok');
});

// Update target URL and adjust kiosk/gpu modifiers
app.post('/url', async (req, res) => {
  if (!req.body.url) {
    return res.status(400).send('Bad request: missing URL in the body element');
  }

  let url = req.body.url;
  if (!HTTPS_REGEX.test(url)) {
    url = 'http://' + url;
  }

  let requiresRelaunch = false;

  if (req.body.kiosk && req.body.kiosk !== kioskMode) {
    kioskMode = req.body.kiosk;
    requiresRelaunch = true;
  }

  if (req.body.gpu && req.body.gpu !== enableGpu) {
    enableGpu = req.body.gpu;
    requiresRelaunch = true;
  }
  
  if (requiresRelaunch) {
    await launchChromium(url);
  } else {
    await navigatePageCDP(url);
  }
  
  return res.status(200).send('ok');
});

// Retrieve the currently rendered URL
app.get('/url', (req, res) => {
  return res.status(200).send(currentUrl);
});

// Force an immediate reload of the active page
app.post('/refresh', async (req, res) => {
  await refreshPageCDP();
  return res.status(200).send('ok');
});

// Toggle hardware acceleration capabilities and regenerate runtime flags
app.post('/gpu/:gpu', async (req, res) => {
  if (req.params.gpu !== '1' && req.params.gpu !== '0') return res.status(400).send('Invalid parameter');
  enableGpu = req.params.gpu;
  await launchChromium(currentUrl);
  return res.status(200).send('ok');
});

// Read the state of active hardware acceleration
app.get('/gpu', (req, res) => {
  return res.status(200).send(enableGpu.toString());
});

// Toggle application UI masking limits and refresh runtime
app.post('/kiosk/:kiosk', async (req, res) => {
  if (!req.params.kiosk) {
    return res.status(400).send('Bad Request');
  }
  kioskMode = req.params.kiosk;
  await launchChromium(currentUrl);
  return res.status(200).send('ok');
});

// Configure or disable the automated asynchronous refresh window interval
app.post('/autorefresh/:interval', async(req, res) => {
  if (!req.params.interval) {
    return res.status(400).send('Bad Request');
  }

  if (req.params.interval < 1) {
    await clearTimer();
  } else {
    await setTimer((req.params.interval * 1000));
  }
  
  return res.status(200).send('ok');
});

// Expose full runtime arguments sent to the browser interface for remote inspection
app.get('/flags', (req, res) => { 
  return res.status(200).send(flags.toString());
});

// Read the current kiosk mode enforcement value
app.get('/kiosk', (req, res) => {
  return res.status(200).send(kioskMode.toString());
});

// Read local version environment parameters
app.get('/version', (req, res) => {
  let version = process.env.VERSION || "Version not set";
  return res.status(200).send(version.toString());
});

// Generates an on-screen capture via Chromium DevTools Protocol (replaces legacy scrot)
app.get('/screenshot', async (req, res) => {
  let client;
  try {
    client = await CDP({ port: REMOTE_DEBUG_PORT });
    const { Page } = client;

    await Page.enable();
    const { data } = await Page.captureScreenshot({ format: 'png' });

    const imageBuffer = Buffer.from(data, 'base64');
    
    res.set('Content-Type', 'image/png');
    return res.status(200).send(imageBuffer);
  } catch (err) {
    console.log("Error occurred when taking screenshot: ", err.toString());
    return res.status(500).send("Error generating native Chromium screenshot.");
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Triggers an immediate recalculation and discovery probe loop for neighboring HTTP containers
app.post('/scan', (req, res) => {
  main().catch(err => {
    console.log("Scan error: ", err);
    process.exit(1);
  });
  return res.status(200).send('ok');
});

app.listen(API_PORT, () => {
  console.log('Browser API running on port: ' + API_PORT);
});

// Graceful cleanup handling on termination signal catch blocks
process.on('SIGINT', () => {
  process.exit();
});