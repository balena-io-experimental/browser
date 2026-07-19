#!/usr/bin/env node
//
// Local test harness for the Home Assistant login automation.
//
// Runs the EXACT same recorder logic the deployed block uses (src/recorder.js)
// against your real HA, in a visible Chrome on your machine, so you can watch
// it, see which step fails, and inspect the real login form to pick correct
// selectors — no balena build/deploy loop.
//
// Usage:
//   HA_USERNAME=you HA_PASSWORD=secret node scripts/test-recorder.js \
//       [--url http://192.168.4.101:8123/lovelace-tvboard/tvboard] \
//       [--script ~/Downloads/ha_login.json] \
//       [--headless] [--no-keep-open] [--path /lovelace-tvboard/tvboard]
//
// Defaults: discovers HA via mDNS if --url is omitted, uses
// recorder-scripts/ha_login.json, runs headful, and keeps the browser open
// after so you can inspect with DevTools. Ctrl-C to quit.

const path = require('path');
const os = require('os');
const fs = require('fs');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const mdns = require(path.join(__dirname, '..', 'src', 'mdns'));
const recorder = require(path.join(__dirname, '..', 'src', 'recorder'));

// --- args --------------------------------------------------------------------
const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const hasFlag = (name) => argv.includes(name);

const SCRIPT = path.resolve(getArg('--script', path.join(__dirname, '..', 'recorder-scripts', 'ha_login.json')).replace(/^~/, os.homedir()));
let URL_ARG = getArg('--url', null);
const DISCOVER_PATH = getArg('--path', process.env.MDNS_DISCOVER_PATH || '');
const HEADLESS = hasFlag('--headless');
const KEEP_OPEN = !hasFlag('--no-keep-open') && !HEADLESS;
const USERNAME = process.env.HA_USERNAME || null;
const PASSWORD = process.env.HA_PASSWORD || null;
const OUT = getArg('--out', process.env.OUT_DIR || null);
const SHOT_DIR = OUT ? (fs.mkdirSync(OUT, { recursive: true }), path.resolve(OUT)) : fs.mkdtempSync(path.join(os.tmpdir(), 'ha-login-'));

function printControls(title, controls) {
  console.log(`\n=== ${title} (${controls.length} controls, shadow DOM pierced) ===`);
  controls.forEach((c, i) => {
    const bits = [
      `#${i}`,
      `<${c.tag}${c.type ? ` type=${c.type}` : ''}>`,
      c.name ? `name=${c.name}` : '',
      c.id ? `id=${c.id}` : '',
      c.autocomplete ? `autocomplete=${c.autocomplete}` : '',
      c.ariaLabel ? `aria="${c.ariaLabel}"` : '',
      c.placeholder ? `ph="${c.placeholder}"` : '',
      c.text ? `text="${c.text}"` : '',
      c.visible ? '' : '(hidden)',
    ].filter(Boolean);
    console.log('   ' + bits.join('  '));
  });
}

async function main() {
  if (!fs.existsSync(SCRIPT)) {
    console.error(`✗ recording not found: ${SCRIPT}\n  Pass one with --script <path>.`);
    process.exit(1);
  }
  if (!USERNAME || !PASSWORD) {
    console.log('⚠ HA_USERNAME / HA_PASSWORD not set — the recording\'s own values will be used.');
  }

  // Resolve the URL to load (discover HA if not given)
  if (!URL_ARG) {
    console.log('No --url given; discovering Home Assistant via mDNS (_home-assistant._tcp)...');
    URL_ARG = await mdns.discoverUrl({ type: 'home-assistant', path: DISCOVER_PATH, timeoutMs: 5000 });
    mdns.stop();
    if (!URL_ARG) {
      console.error('✗ Could not discover HA. Pass the URL explicitly with --url http://<ip>:8123/...');
      process.exit(1);
    }
  }
  console.log(`Recording : ${SCRIPT}`);
  console.log(`Target URL: ${URL_ARG}`);
  console.log(`Mode      : ${HEADLESS ? 'headless' : 'headful (watch the window)'}\n`);

  const chrome = await chromeLauncher.launch({
    startingUrl: URL_ARG,
    chromeFlags: HEADLESS
      ? ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1920,1080']
      : ['--disable-features=PasswordManager,Translate'],
    ignoreDefaultFlags: false,
  });

  const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}`, defaultViewport: null });
  await new Promise((r) => setTimeout(r, 2500));
  const pages = await browser.pages();
  const page = pages[pages.length - 1];
  const pageUrl = page.url();
  console.log(`Loaded page: ${pageUrl}`);

  const onAuth = pageUrl.includes('/auth/') || pageUrl.includes('authorize') || pageUrl.includes('auth_callback');
  console.log(`On auth page: ${onAuth}\n`);

  // Show the real login form BEFORE running, so we can pick correct selectors.
  try {
    const before = await recorder.probeFormControls(page);
    printControls('LOGIN FORM CONTROLS (before)', before);
    fs.writeFileSync(path.join(SHOT_DIR, 'controls-before.json'), JSON.stringify(before, null, 2));
    await page.screenshot({ path: path.join(SHOT_DIR, 'before.png') });
    console.log(`(saved before.png + controls-before.json to ${SHOT_DIR})`);
  } catch (e) { console.log('probe failed:', e.message); }

  let ok = false;
  if (hasFlag('--smart')) {
    // Direct shadow-piercing credential login (no recording replay).
    console.log('\n--- Running SMART login (shadow-piercing selectors) ---');
    const u = USERNAME || 'TEST_USERNAME';
    const p = PASSWORD || 'TEST_PASSWORD';
    try {
      const accepted = await recorder.smartLogin({ page, username: u, password: p, timeout: 20000, log: console.log });
      ok = accepted;
      console.log(accepted
        ? '\n✓✓✓ SMART LOGIN ACCEPTED — navigated to the app.'
        : '\n⚠ Fields filled and submitted, but still on auth page (expected with placeholder creds).');
    } catch (err) {
      console.error(`\n✗✗✗ SMART LOGIN FAILED: ${err.message}`);
    }
  } else {
    const recording = JSON.parse(fs.readFileSync(SCRIPT, 'utf-8'));
    console.log(`\nLoaded recording "${recording.title || 'Untitled'}" with ${recording.steps.length} steps`);
    console.log('\n--- Preparing recording ---');
    recorder.prepareLoginRecording(recording, { pageUrl, username: USERNAME, password: PASSWORD, log: console.log });
    console.log('\n--- Running recording ---');
    try {
      await recorder.runLoginRecording({ browser, page, recording, timeout: 30000, log: console.log });
      ok = true;
      console.log('\n✓✓✓ RECORDING COMPLETED — login flow ran to the end.');
    } catch (err) {
      console.error(`\n✗✗✗ RECORDING FAILED: ${err.message}`);
      console.error('   ^ the last "▶ step N" above without a matching "✓ step N done" is the failing step.');
    }
  }

  // After-state: URL, screenshot, and form probe to inform the fix.
  const finalUrl = page.url();
  console.log(`\nFinal URL: ${finalUrl}`);
  const shot = path.join(SHOT_DIR, ok ? 'success.png' : 'failure.png');
  try { await page.screenshot({ path: shot, fullPage: false }); console.log(`Screenshot: ${shot}`); } catch (e) {}
  if (!ok) {
    try {
      const after = await recorder.probeFormControls(page);
      printControls('FORM CONTROLS (at failure)', after);
      fs.writeFileSync(path.join(SHOT_DIR, 'controls-failure.json'), JSON.stringify(after, null, 2));
    } catch (e) {}
  }
  console.log(`\nArtifacts (screenshots + probes): ${SHOT_DIR}`);

  if (KEEP_OPEN) {
    console.log('\nBrowser left open for inspection. Open DevTools, try selectors in the console, then Ctrl-C here to quit.');
    await new Promise(() => {}); // hang until Ctrl-C
  } else {
    await browser.disconnect();
    await chromeLauncher.killAll();
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('harness error:', e); process.exit(1); });
