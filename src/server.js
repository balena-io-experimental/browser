#!/bin/env node

const express = require('express');
const bodyParser = require('body-parser');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const bent = require('bent')
const mdns = require('./mdns');
const recorder = require('./recorder');
const {
  setIntervalAsync,
  clearIntervalAsync
} = require('set-interval-async/dynamic')
const { spawn } = require('child_process');
const { readFile, unlink } = require('fs').promises;
const path = require('path');
const os = require('os');

// Bring in the static environment variables
const API_PORT = parseInt(process.env.API_PORT) || 5011;
const WINDOW_SIZE = process.env.WINDOW_SIZE || "800,600";
const WINDOW_POSITION = process.env.WINDOW_POSITION || "0,0";
const PERSISTENT_DATA = process.env.PERSISTENT || '0';
const REMOTE_DEBUG_PORT = process.env.REMOTE_DEBUG_PORT || 35173;
const FLAGS = process.env.FLAGS || null;
const EXTRA_FLAGS = process.env.EXTRA_FLAGS || null;
const HTTPS_REGEX = /^https?:\/\//i //regex for HTTP/S prefix
const AUTO_REFRESH = process.env.AUTO_REFRESH || 0;
const FORCE_VULKAN = process.env.FORCE_VULKAN || "-1";
const RECORDER_SCRIPT_PATH = process.env.RECORDER_SCRIPT_PATH || null;
const ENABLE_RECORDER_SCRIPT = process.env.ENABLE_RECORDER_SCRIPT || '0';
const HA_USERNAME = process.env.HA_USERNAME || null;
const HA_PASSWORD = process.env.HA_PASSWORD || null;

// mDNS / DNS-SD configuration
const MDNS_ADVERTISE = process.env.MDNS_ADVERTISE || '1';
const MDNS_NAME = process.env.MDNS_NAME || process.env.BALENA_DEVICE_NAME_AT_INIT || os.hostname() || 'balena-browser';
const MDNS_DISCOVER = process.env.MDNS_DISCOVER || '0';
const MDNS_DISCOVER_NAME = process.env.MDNS_DISCOVER_NAME || null;
const MDNS_DISCOVER_TYPE = process.env.MDNS_DISCOVER_TYPE || 'http';
const MDNS_DISCOVER_PATH = process.env.MDNS_DISCOVER_PATH || null;
const MDNS_DISCOVER_TIMEOUT = parseInt(process.env.MDNS_DISCOVER_TIMEOUT) || 5;

// Environment variables which can be overriden from the API
let kioskMode = process.env.KIOSK || '0';
let enableGpu = process.env.ENABLE_GPU || '0';

let DEFAULT_FLAGS = [];
let currentUrl = '';
let flags = [];

// Refresh timer object
let timer = {};

// Returns the URL to display, adhering to the hieracrchy:
// 1) the configured LAUNCH_URL
// 2) an HTTP service discovered on the LAN via mDNS (if MDNS_DISCOVER=1)
// 3) a discovered HTTP service on the device
// 4) the default static HTML
async function getUrlToDisplayAsync() {
  let launchUrl = process.env.LAUNCH_URL || null;
    if (null !== launchUrl)
    {
      console.log(`Using LAUNCH_URL: ${launchUrl}`)

      // Prepend http:// if the LAUNCH_URL doesn't have it.
      // This is needed for the --app flag to be used for kiosk mode
      if (!HTTPS_REGEX.test(launchUrl)) {
        launchUrl = `http://${launchUrl}`;
      }

      return launchUrl;
    }

    console.log("LAUNCH_URL environment variable not set.")

    // Optionally browse the LAN for a service advertised over mDNS.
    if (MDNS_DISCOVER === '1') {
      console.log(
        `Looking for an mDNS "_${MDNS_DISCOVER_TYPE}._tcp" service on the LAN` +
        (MDNS_DISCOVER_NAME ? ` named "${MDNS_DISCOVER_NAME}"` : '')
      );
      try {
        const discovered = await mdns.discoverUrl({
          type: MDNS_DISCOVER_TYPE,
          name: MDNS_DISCOVER_NAME,
          path: MDNS_DISCOVER_PATH,
          timeoutMs: MDNS_DISCOVER_TIMEOUT * 1000,
        });
        if (discovered) {
          console.log(`mDNS service found at: ${discovered}`);
          return discovered;
        }
        console.log("No matching mDNS service found on the LAN");
      } catch (e) {
        console.log(`mDNS discovery error: ${e.message}`);
      }
    }

    console.log("Looking for local HTTP/S services.")

    // make a HTTP/S request for each supported port to the localhost
    // add the URL to the array if HTTP200 is returned
    let ports = [80,443,8080];
    let returnURL = null;
    let urls = []
    for await (const port of ports) {
      const protocol = 443 === port ? `https` : `http`;
      const url = `${protocol}://localhost:${port}`;
      try {
        const request = bent(url);
        const response = await request();
        console.log(`Trying local port ${port}`)
        if (200 == response.statusCode)
        {
          console.log("HTTP/S service found at: " + url)
          urls.push(url)
        }
      }
      catch(e)
      {
        //Nothing to do here, failure is expected when nothing
        //is listening on a port
        console.log(`No service found on port ${port}`);
      }
    }

    if(urls.length > 0)
    {
      // return the first URL that returned 200
      returnURL = urls[0];
    }
    // Otherwise send the default HTML
    else
    {
      console.log("Displaying default HTML page");
      returnURL = "file:///home/chromium/index.html";
    }

    return returnURL;
  }
       
// Launch the browser with the URL specified
let launchChromium = async function(url) {
    await chromeLauncher.killAll();

    flags = [];
    // If the user has set the flags, use them
    if (null !== FLAGS)
    {
      flags = FLAGS.split(' ');
    }
    else
    {
      // User the default flags from chrome-launcher, plus our own.
      flags = DEFAULT_FLAGS;
      let balenaFlags = [
        '--window-size=' + WINDOW_SIZE,
        '--window-position=' + WINDOW_POSITION,
        '--autoplay-policy=no-user-gesture-required',
        '--noerrdialogs',
        '--disable-session-crashed-bubble',
        '--check-for-update-interval=31536000',
        '--disable-dev-shm-usage', // TODO: work out if we can enable this for devices with >1Gb of memory
        '--disable-features=PasswordManager,Translate',
        '--password-store=basic',
        '--disable-save-password-bubble',
        '--disable-password-generation',
      ];

      // Merge the chromium default and balena default flags
      flags = flags.concat(balenaFlags);

      // either disable the gpu or set some flags to enable it
      if (enableGpu != '1')
      {
        console.log("Disabling GPU");
        flags.push('--disable-gpu');
      }
      else
      {
        console.log("Enabling GPU");
        let gpuFlags = [
          '--enable-zero-copy',
          '--num-raster-threads=4',
          '--ignore-gpu-blocklist',
          '--enable-gpu-rasterization',
        ];

        // Enable vulkan
        // This only seems to make a difference on the Raspberry Pi 5,
        // it enables HW accelerated video decoding at the cost of some OpenGL performance
        // * If FORCE_VULKAN is 0, never enable vulkan
        // * If FORCE_VULKAN is 1, always enable vulkan
        // * If FORCE_VULKAN is anything else or undefined, enable vulkan if the device is a RPi5
        if (FORCE_VULKAN === "1" || (process.env.BALENA_DEVICE_TYPE === "raspberrypi5" && FORCE_VULKAN !== "0"))
        {
          gpuFlags.push('--enable-features=Vulkan');
        }

        flags = flags.concat(gpuFlags);
      }
    }

    if (EXTRA_FLAGS) {
      flags = flags.concat(EXTRA_FLAGS.split(' '));
    }

    let startingUrl = url;
    if ('1' === kioskMode)
    {
      console.log("Enabling KIOSK mode");
      startingUrl = `--app= ${url}`;
    }
    else
    {
      console.log("Disabling KIOSK mode");
    }

    console.log(`Starting Chromium with flags: ${flags}`);
    console.log(`Displaying URL: ${startingUrl}`);

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

    // Execute recorder script if enabled and provided
    if (ENABLE_RECORDER_SCRIPT === '1' && RECORDER_SCRIPT_PATH) {
      await executeRecorderScript(chrome.port);
    }
}

// Execute Chrome Recorder script (Puppeteer Replay JSON format)
async function executeRecorderScript(port) {
  if (!RECORDER_SCRIPT_PATH) {
    console.log("No recorder script path provided");
    return;
  }

  try {
    console.log("========================================");
    console.log("RECORDER SCRIPT EXECUTION STARTED");
    console.log("========================================");
    console.log(`Loading script from: ${RECORDER_SCRIPT_PATH}`);

    // Read the recorder JSON file
    const recordingJSON = await readFile(RECORDER_SCRIPT_PATH, 'utf-8');
    console.log(`✓ Script file read successfully (${recordingJSON.length} bytes)`);

    const recording = JSON.parse(recordingJSON);
    console.log(`✓ JSON parsed successfully`);
    console.log(`Recording title: ${recording.title || 'Untitled'}`);
    console.log(`Number of steps: ${recording.steps ? recording.steps.length : 'unknown'}`);

    // Connect to the already-running Chrome instance
    console.log(`Connecting to Chrome on port ${port}...`);
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
      defaultViewport: null
    });
    console.log("✓ Connected to Chrome browser");

    // Wait a moment for the page to be ready
    console.log("Waiting 2 seconds for page to be ready...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the first page (should be our launched URL)
    const pages = await browser.pages();
    const page = pages[pages.length - 1]; // Get the most recent page
    const pageUrl = page.url();
    console.log(`✓ Got browser page: ${pageUrl}`);

    // Check if we're already logged in (persistent storage session)
    // If we're on the auth page, we need to login; otherwise skip to final navigation
    const isOnAuthPage = pageUrl.includes('/auth/') || pageUrl.includes('auth_callback');
    const needsLogin = isOnAuthPage || pageUrl.includes('authorize');

    console.log(`Checking login status...`);
    console.log(`  Current URL: ${pageUrl}`);
    console.log(`  On auth page: ${isOnAuthPage}`);
    console.log(`  Needs login: ${needsLogin}`);

    // Retarget helper shared with the login-preparation logic (see src/recorder.js).
    const { retargetUrl } = recorder.computeRetarget(recording, pageUrl, console.log);

    if (needsLogin) {
      let loggedIn = false;

      // Primary path: direct credential login using shadow-piercing selectors.
      // Robust against web-component/shadow-DOM login forms (e.g. Home Assistant)
      // where recorded CSS selectors can't reach the real <input> elements. On
      // success the auth flow's redirect_uri returns to the requested dashboard.
      if (HA_USERNAME && HA_PASSWORD) {
        try {
          console.log("Attempting direct credential login...");
          loggedIn = await recorder.smartLogin({
            page, username: HA_USERNAME, password: HA_PASSWORD, timeout: 20000, log: console.log,
          });
          if (loggedIn) {
            console.log("✓ Logged in via direct credential fill.");
            // The auth redirect returns to the dashboard but drops query params
            // (e.g. ?kiosk that hides the HA sidebar). Re-open the exact display
            // URL so those params take effect.
            if (currentUrl) {
              try {
                console.log(`Re-opening display URL: ${currentUrl}`);
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              } catch (e) {
                console.log(`Post-login navigation warning: ${e.message}`);
              }
            }
          } else {
            console.log("Direct login did not complete - falling back to recorded script.");
          }
        } catch (e) {
          console.log(`Direct login unavailable (${e.message}) - falling back to recorded script.`);
        }
      } else {
        console.log("⚠ No HA_USERNAME or HA_PASSWORD set - using the recorded script's values.");
      }

      // Fallback: replay the recording (retargeted, credentials injected).
      if (!loggedIn) {
        recorder.prepareLoginRecording(recording, {
          pageUrl, username: HA_USERNAME, password: HA_PASSWORD, log: console.log,
        });
        console.log("========================================");
        console.log("EXECUTING RECORDED ACTIONS...");
        console.log("========================================");
        await recorder.runLoginRecording({ browser, page, recording, timeout: 30000, log: console.log });
      }
    } else {
      console.log("Already logged in (persistent session detected) - skipping login steps");

      // Find the final navigation step (typically to the kiosk/dashboard URL)
      const finalNavStep = recording.steps
        .filter(step => step.type === 'navigate')
        .pop();

      if (finalNavStep && finalNavStep.url) {
        const target = retargetUrl(finalNavStep.url);
        console.log(`Navigating directly to: ${target}`);
        await page.goto(target, { waitUntil: 'networkidle0', timeout: 30000 });
        console.log("✓ Navigation complete");
      } else {
        console.log("No final navigation step found in recording");
      }
    }

    console.log("========================================");
    console.log("✓ RECORDER SCRIPT COMPLETED SUCCESSFULLY");
    console.log("========================================");

    // Disconnect (don't close the browser, just disconnect)
    await browser.disconnect();
    console.log("✓ Disconnected from browser");
  } catch (err) {
    console.error("========================================");
    console.error("✗ RECORDER SCRIPT FAILED");
    console.error("========================================");
    console.error("Error:", err.message);
    if (err.code) {
      console.error("Error code:", err.code);
    }
    if (err.stack) {
      console.error("Stack trace:", err.stack);
    }
    console.error("========================================");
  }
}

// Get's the chrome-launcher default flags, minus the extensions and audio muting flags.
async function SetDefaultFlags() {
  DEFAULT_FLAGS =  await chromeLauncher.Launcher.defaultFlags().filter(flag => '--disable-extensions' !== flag && '--mute-audio' !== flag);
}

async function setTimer(interval) {
  console.log("Auto refresh interval seconds: ", interval);
  timer = setIntervalAsync(
    async () => {
      try {
        await launchChromium(currentUrl);
      } catch (err) {
        console.log("Timer error: ", err);
        process.exit(1);
      }
    },
    interval
  )
  
}

async function clearTimer(){
  await clearIntervalAsync(timer);
}

async function main(){
  await SetDefaultFlags();
  let url = await getUrlToDisplayAsync();
  await launchChromium(url);
  if (AUTO_REFRESH > 0)
  {
    await setTimer(AUTO_REFRESH * 1000);
  }
}


main().catch(err => {
  console.log("Main error: ", err);
  process.exit(1);
});

// Start the API
const app = express();

const errorHandler = (err, req, res, next) => {
  res.status(500);
  res.render('API error: ', {
    error: err
  });
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.use(errorHandler);

// ping endpoint
app.get('/ping', (req, res) => {
    
    return res.status(200).send('ok');
});

// url set endpoint
app.post('/url', (req, res) => {
  if (!req.body.url) {
    return res.status(400).send('Bad request: missing URL in the body element');
  }

  let url = req.body.url;

  // prepend http prefix if necessary for kiosk mode to work
  if (!HTTPS_REGEX.test(url)) {
    url = 'http://' + url;
  }

  if (req.body.kiosk) {
    kioskMode = req.body.kiosk;
  }

  if (req.body.gpu) {
    enableGpu = req.body.gpu;
  }

  launchChromium(url);
  return res.status(200).send('ok');
});

// url get endpoint
app.get('/url', (req, res) => {
    
  return res.status(200).send(currentUrl);
});

// refresh endpoint
app.post('/refresh', (req, res) => {
 
  launchChromium(currentUrl);
  return res.status(200).send('ok');
});

// gpu set endpoint
app.post('/gpu/:gpu', (req, res) => {
  if (!req.params.gpu) {
    return res.status(400).send('Bad Request');
  }

  if('1' !== req.params.gpu && '0' !== req.params.gpu)
  {
    return res.status(400).send('Bad Request');
  }

  enableGpu = req.params.gpu;
  launchChromium(currentUrl);
  return res.status(200).send('ok');
});
// gpu get endpoint
app.get('/gpu', (req, res) => {
    
  return res.status(200).send(enableGpu.toString());
});

// kiosk set endpoint
app.post('/kiosk/:kiosk', (req, res) => {
  if (!req.params.kiosk) {
    return res.status(400).send('Bad Request');
  }

  kioskMode = req.params.kiosk;
  launchChromium(currentUrl);
  return res.status(200).send('ok');
});

app.post('/autorefresh/:interval', async(req, res) => {
  if (!req.params.interval) {
    return res.status(400).send('Bad Request');
  }

  if(req.params.interval < 1)
  {
    await clearTimer();
  }
  else
  {
    await setTimer((req.params.interval * 1000))
  }
  
  return res.status(200).send('ok');
});

// flags endpoint
app.get('/flags', (req, res) => { 
    
  return res.status(200).send(flags.toString());
});

// kiosk get endpoint
app.get('/kiosk', (req, res) => {
    
  return res.status(200).send(kioskMode.toString());
});

// version get endpoint
app.get('/version', (req, res) => {
  
  let version = process.env.VERSION || "Version not set";
  return res.status(200).send(version.toString());
});

app.get('/screenshot', async(req, res) => {
  const fileName = process.hrtime.bigint() + '.png';
  const filePath = path.join(os.tmpdir(), fileName);
  try {
    const child = spawn('scrot', [filePath]);

    const statusCode = await new Promise( (res, rej) => { child.on('close', res); } );
    if (statusCode != 0) {
      return res.status(500).send("Screenshot command exited with non-zero return code.");
    }

    const fileContents = await readFile(filePath);
    res.set('Content-Type', 'image/png');
    return res.status(200).send(fileContents);
  } catch(e) {
    console.log(e.toString());
    return res.status(500).send("Error occurred in screenshot code.");
  } finally {
    try {
      await unlink(filePath);
    } catch (e) {
      console.log(e)
    }
  }
});

// scan endpoint - causes the device to rescan for local HTTP services
app.post('/scan', (req, res) => {
 
  main().catch(err => {
    console.log("Scan error: ", err);
    process.exit(1);
  });
  return res.status(200).send('ok');
});

// mDNS endpoint - reports what we advertise and what we can currently see
app.get('/mdns', async (req, res) => {
  try {
    const services = await mdns.browse({
      type: MDNS_DISCOVER_TYPE,
      timeoutMs: MDNS_DISCOVER_TIMEOUT * 1000,
    });
    return res.status(200).json({
      advertising: MDNS_ADVERTISE === '1'
        ? { name: MDNS_NAME, type: '_http._tcp', port: API_PORT }
        : null,
      discovered: services.map((s) => ({
        name: s.name,
        host: s.host,
        port: s.port,
        addresses: s.addresses,
        fqdn: s.fqdn,
        url: mdns.serviceToUrl(s),
      })),
    });
  } catch (e) {
    return res.status(500).send('mDNS error: ' + e.message);
  }
});

app.listen(API_PORT, () => {
  console.log('Browser API running on port: ' + API_PORT);

  // Advertise this device's API on the LAN over mDNS.
  if (MDNS_ADVERTISE === '1') {
    mdns.advertise({
      name: MDNS_NAME,
      port: API_PORT,
      txt: { role: 'balena-browser' },
    });
  }
});

process.on('SIGINT', () => {
  mdns.stop();
  process.exit();
});
