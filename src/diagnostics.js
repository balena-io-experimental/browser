/**
 * Diagnostics for the balena Browser Block.
 *
 * Everything here is gated behind ENABLE_DIAGNOSTICS (default off) because it
 * exposes internal Chromium/GPU/system state. When enabled it:
 *   - captures recent block + Chromium logs,
 *   - exposes the existing /diagnostics/{version,gpu,media} JSON endpoints,
 *   - adds /diagnostics/report: a single, human-readable .txt bundling
 *     device/host info, runtime config, Chromium/GPU/media state and recent logs
 *     (useful for testers now and end-user bug reports later).
 */

const fs = require('fs');
const os = require('os');
const util = require('util');
const CDP = require('chrome-remote-interface');

const ENABLE_DIAGNOSTICS = process.env.ENABLE_DIAGNOSTICS || '0';
const enabled = ENABLE_DIAGNOSTICS === '1';

// Chromium writes its own log here when diagnostics are on, so the report can
// include GPU-process crashes / decoder / ALSA errors that never reach the
// block's console.log. Same file used during manual debugging.
const CHROMIUM_LOG_PATH = '/tmp/chrome_debug.log';

// Bounded in-memory ring buffer of recent block log lines.
const LOG_BUFFER_MAX = 500;
const logBuffer = [];
const originalConsoleLog = console.log;

// Wrap console.log once (rather than touching every call site) so the report can
// include the block's own output. Installed only when diagnostics are enabled, so
// there is zero overhead in the default configuration.
function startLogCapture() {
  console.log = (...args) => {
    logBuffer.push(`${new Date().toISOString()} ${util.format(...args)}`);
    if (logBuffer.length > LOG_BUFFER_MAX) {
      logBuffer.shift();
    }
    originalConsoleLog(...args);
  };
}

if (enabled) {
  startLogCapture();
}

/**
 * Flags that tell Chromium to write its own log to CHROMIUM_LOG_PATH. Empty when
 * diagnostics are disabled so the default launch is untouched.
 */
function chromiumLogFlags() {
  return enabled ? ['--enable-logging', `--log-file=${CHROMIUM_LOG_PATH}`] : [];
}

// ----------------------------------------------------------------------------
// Collectors (one CDP connection each; throw on failure so callers can record it)
// ----------------------------------------------------------------------------

async function getChromiumVersion(port) {
  const info = await CDP.Version({ port });
  return {
    browser: info['Browser'],                 // e.g. "Chrome/148.0.7778.167"
    protocolVersion: info['Protocol-Version'],
    v8Version: info['V8-Version'],
    webkitVersion: info['WebKit-Version'],
    userAgent: info['User-Agent'],
    blockVersion: process.env.VERSION || null
  };
}

async function getGpuInfo(port) {
  let client;
  try {
    // Connect to the master browser session to run the SystemInfo command,
    // which returns the same data as chrome://gpu without opening a window.
    const browserVersion = await CDP.Version({ port });
    client = await CDP({ target: browserVersion.webSocketDebuggerUrl });

    if (client.SystemInfo && typeof client.SystemInfo.getInfo === 'function') {
      const infoPayload = await client.SystemInfo.getInfo();
      return infoPayload.gpu; // devices, featureStatus, driverBugWorkarounds, ...
    }
    throw new Error('SystemInfo protocol domain not exposed by this Chromium binary.');
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function getMediaState(port) {
  let client;
  try {
    // Inspect the primary user-visible page without disrupting the compositor.
    const targets = await CDP.List({ port });
    const pageTarget = targets.find(t => t.type === 'page');

    if (!pageTarget) {
      return { activePlaybackCount: 0, players: [] };
    }

    client = await CDP({ target: pageTarget });
    const { Media } = client;

    const activePlayers = {};

    // Trap properties as Chromium flushes them down the WebSocket connection.
    Media.playerPropertiesChanged((params) => {
      const { playerId, properties } = params;
      if (!activePlayers[playerId]) {
        activePlayers[playerId] = {};
      }
      properties.forEach(prop => {
        activePlayers[playerId][prop.name] = prop.value;
      });
    });

    await Media.enable();
    // Brief settle window for the socket events to arrive.
    await new Promise(resolve => setTimeout(resolve, 400));

    const players = Object.keys(activePlayers).map(id => {
      const playerData = activePlayers[id];
      const decoderName = playerData.video_decoder || playerData.kVideoDecoderName || 'Unknown';

      // Hardware-accelerated based on the runtime driver name or metadata.
      const isHardware = playerData.is_platform_video_decoder === 'true' ||
                         playerData.is_platform_video_decoder === true ||
                         /v4l2|vaapi|mojo|d3d11/i.test(decoderName);

      return {
        playerId: id,
        videoCodec: playerData.video_codec_name || 'Unknown',
        decoderName,
        isHardwareAccelerated: isHardware,
        resolution: `${playerData.video_width || 0}x${playerData.video_height || 0}`,
        rawProperties: playerData
      };
    });

    return { activePlaybackCount: players.length, players };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Device and host facts that don't need Chromium. Only a whitelist of balena
 * env vars is read — process.env is never dumped, so a shared report can't leak
 * secrets.
 */
function getDeviceInfo() {
  const cpus = os.cpus();
  return {
    deviceType: process.env.BALENA_DEVICE_TYPE || null,
    deviceArch: process.env.BALENA_DEVICE_ARCH || null,
    deviceUuid: process.env.BALENA_DEVICE_UUID || null,
    appName: process.env.BALENA_APP_NAME || null,
    osVersion: process.env.BALENA_HOST_OS_VERSION || null,
    supervisorVersion: process.env.BALENA_SUPERVISOR_VERSION || null,
    hostname: os.hostname(),
    kernel: os.release(),
    arch: os.arch(),
    cpuModel: (cpus[0] || {}).model || null,
    cpuCount: cpus.length,
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
    loadavg: os.loadavg(),
    uptimeSeconds: Math.round(os.uptime())
  };
}

/**
 * Last `lines` lines of the Chromium log, or a note if it isn't there yet.
 */
function tailChromiumLog(lines = 200) {
  try {
    const content = fs.readFileSync(CHROMIUM_LOG_PATH, 'utf8');
    return content.trim().split('\n').slice(-lines).join('\n');
  } catch (err) {
    return `(no Chromium log at ${CHROMIUM_LOG_PATH}: ${err.code || err.message})`;
  }
}

// ----------------------------------------------------------------------------
// Report formatting (plain text, sectioned for quick human reading)
// ----------------------------------------------------------------------------

function bytesToMb(bytes) {
  return typeof bytes === 'number' ? `${Math.round(bytes / 1024 / 1024)} MB` : 'unknown';
}

function section(title, body) {
  return `\n--- ${title} ---\n${body}\n`;
}

function formatDevice(d) {
  return [
    `device type   : ${d.deviceType || 'unknown'}`,
    `device arch   : ${d.deviceArch || 'unknown'}`,
    `device uuid   : ${d.deviceUuid || 'unknown'}`,
    `app / fleet   : ${d.appName || 'unknown'}`,
    `balenaOS      : ${d.osVersion || 'unknown'}`,
    `supervisor    : ${d.supervisorVersion || 'unknown'}`,
    `hostname      : ${d.hostname}`,
    `kernel        : ${d.kernel}`,
    `cpu           : ${d.cpuModel || 'unknown'} x${d.cpuCount}`,
    `memory        : ${bytesToMb(d.freeMemBytes)} free / ${bytesToMb(d.totalMemBytes)} total`,
    `load average  : ${d.loadavg.map(n => n.toFixed(2)).join(' ')}`,
    `uptime        : ${d.uptimeSeconds}s`
  ].join('\n');
}

function formatRuntime(r) {
  return [
    `ENABLE_GPU           : ${r.enableGpu}`,
    `DISABLE_VIDEO_DECODE : ${r.disableVideoDecode}`,
    `kiosk                : ${r.kioskMode}`,
    `current URL          : ${r.currentUrl || '(none)'}`,
    '',
    'flags:',
    ...(r.flags || []).map(f => `  ${f}`)
  ].join('\n');
}

function formatChromium(c) {
  if (c.error) {
    return `error: ${c.error}`;
  }
  return [
    `browser    : ${c.browser}`,
    `v8         : ${c.v8Version}`,
    `webkit     : ${c.webkitVersion}`,
    `user-agent : ${c.userAgent}`,
    `block      : ${c.blockVersion || 'unknown'}`
  ].join('\n');
}

function formatGpu(g) {
  if (g.error) {
    return `error: ${g.error}`;
  }
  const parts = [];

  if (g.featureStatus && typeof g.featureStatus === 'object') {
    parts.push('feature status:');
    for (const [name, status] of Object.entries(g.featureStatus)) {
      parts.push(`  ${name}: ${status}`);
    }
  }

  if (Array.isArray(g.devices) && g.devices.length) {
    parts.push('\ndevices:');
    g.devices.forEach(dev => {
      const desc = dev.deviceString || `${dev.vendorId}:${dev.deviceId}`;
      parts.push(`  ${desc}`);
    });
  }

  // Keep the full payload too so nothing useful is lost.
  parts.push('\nfull payload:');
  parts.push(JSON.stringify(g, null, 2));
  return parts.join('\n');
}

function formatMedia(m) {
  if (m.error) {
    return `error: ${m.error}`;
  }
  if (!m.players || m.players.length === 0) {
    return 'no active media players (nothing playing at report time).';
  }
  return m.players.map(p => [
    `player ${p.playerId}:`,
    `  codec      : ${p.videoCodec}`,
    `  decoder    : ${p.decoderName}`,
    `  hardware   : ${p.isHardwareAccelerated}`,
    `  resolution : ${p.resolution}`
  ].join('\n')).join('\n\n');
}

function formatReport(data) {
  const header =
    '===== balena browser-block diagnostics =====\n' +
    `generated   : ${data.generatedAt}\n` +
    `block       : ${data.runtime.blockVersion || process.env.VERSION || 'unknown'}`;

  return [
    header,
    section('DEVICE & HOST', formatDevice(data.device)),
    section('RUNTIME CONFIG', formatRuntime(data.runtime)),
    section('CHROMIUM', formatChromium(data.chromium)),
    section('GPU (chrome://gpu)', formatGpu(data.gpu)),
    section('MEDIA PLAYERS', formatMedia(data.media)),
    section('RECENT BLOCK LOG', data.log.block.length ? data.log.block.join('\n') : '(empty)'),
    section('RECENT CHROMIUM LOG', data.log.chromium)
  ].join('\n');
}

// Build a filename like browser-block-raspberrypi5-6.5.7-diagnostics-2026-06-16T1042Z.txt
function reportFilename(device, generatedAt) {
  const clean = (v, fallback) => String(v || fallback).replace(/[^A-Za-z0-9._-]/g, '_');
  const deviceType = clean(device.deviceType, 'unknown');
  const balenaOs = clean(device.osVersion, 'unknown');
  const stamp = clean(generatedAt, 'unknown');
  return `browser-block-${deviceType}-${balenaOs}-diagnostics-${stamp}.txt`;
}

// ----------------------------------------------------------------------------
// Route registration
// ----------------------------------------------------------------------------

/**
 * Registers the diagnostics endpoints on the given Express app.
 *
 * @param {object}   app             Express app.
 * @param {object}   deps
 * @param {number}   deps.debugPort  Chromium DevTools port.
 * @param {Function} deps.getRuntimeConfig  Returns the live runtime config
 *        ({ enableGpu, disableVideoDecode, kioskMode, currentUrl, flags }).
 */
function register(app, { debugPort, getRuntimeConfig }) {
  // Refuse diagnostics requests unless explicitly enabled.
  function diagnosticsGuard(req, res, next) {
    if (!enabled) {
      return res.status(404).send('Diagnostics are disabled. Set ENABLE_DIAGNOSTICS=1 to enable them.');
    }
    next();
  }

  // Running Chromium build/version and the block version.
  app.get('/diagnostics/version', diagnosticsGuard, async (req, res) => {
    try {
      return res.status(200).json(await getChromiumVersion(debugPort));
    } catch (err) {
      console.log('Error retrieving Chromium version: ', err.toString());
      return res.status(500).send('Failed to retrieve Chromium version.');
    }
  });

  // Full GPU diagnostic data (same as chrome://gpu).
  app.get('/diagnostics/gpu', diagnosticsGuard, async (req, res) => {
    try {
      return res.status(200).json(await getGpuInfo(debugPort));
    } catch (err) {
      console.log('Error during SystemInfo extraction: ', err.toString());
      return res.status(500).send('Failed to extract GPU diagnostic payload.');
    }
  });

  // Active media player states (decoder + hardware acceleration).
  app.get('/diagnostics/media', diagnosticsGuard, async (req, res) => {
    try {
      return res.status(200).json(await getMediaState(debugPort));
    } catch (err) {
      console.log('Error executing media diagnostics: ', err.toString());
      return res.status(500).send('Failed to extract active media decoder states.');
    }
  });

  // Single downloadable, human-readable report bundling everything above.
  app.get('/diagnostics/report', diagnosticsGuard, async (req, res) => {
    const generatedAt = new Date().toISOString().replace(/:/g, '').replace(/\.\d+Z$/, 'Z');
    const device = getDeviceInfo();
    const runtime = getRuntimeConfig();

    const report = {
      generatedAt: new Date().toISOString(),
      device,
      runtime,
      chromium: null,
      gpu: null,
      media: null,
      log: { block: logBuffer.slice(), chromium: tailChromiumLog() }
    };

    // Collect each CDP-backed section independently so one failure still yields
    // a complete file (with an error note in the failing section).
    const collectors = [
      ['chromium', () => getChromiumVersion(debugPort)],
      ['gpu', () => getGpuInfo(debugPort)],
      ['media', () => getMediaState(debugPort)]
    ];
    for (const [key, fn] of collectors) {
      try {
        report[key] = await fn();
      } catch (err) {
        report[key] = { error: err.toString() };
      }
    }

    res.type('text/plain');
    res.set('Content-Disposition', `attachment; filename="${reportFilename(device, generatedAt)}"`);
    return res.status(200).send(formatReport(report));
  });
}

module.exports = {
  enabled,
  chromiumLogFlags,
  register
};
