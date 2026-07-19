// Shared Chrome-recorder (Puppeteer Replay) login logic, used by both the
// deployed server (src/server.js) and the local test harness
// (scripts/test-recorder.js) so they run identical code.

const { createRunner, PuppeteerRunnerExtension } = require('@puppeteer/replay');

// Build a helper that rewrites the recorded origin (scheme://host:port) to the
// origin actually loaded, so a recording made on one network works on another.
function computeRetarget(recording, pageUrl, log = () => {}) {
  let currentOrigin = null;
  try { currentOrigin = new URL(pageUrl).origin; } catch (e) { /* not a URL */ }
  const firstNav = (recording.steps || []).find((s) => s.type === 'navigate' && s.url);
  let recordedOrigin = null;
  if (firstNav) { try { recordedOrigin = new URL(firstNav.url).origin; } catch (e) { /* ignore */ } }
  const retargetUrl = (url) =>
    (url && recordedOrigin && currentOrigin) ? url.split(recordedOrigin).join(currentOrigin) : url;
  if (recordedOrigin && currentOrigin && recordedOrigin !== currentOrigin) {
    log(`Retargeting recording origin: ${recordedOrigin} -> ${currentOrigin}`);
  }
  return { retargetUrl, recordedOrigin, currentOrigin };
}

// Prepare a recording for replay against the currently loaded page:
//  - replace username/password placeholders with real credentials
//  - drop stale /auth/ navigations (we are already on the auth page)
//  - retarget remaining navigations + assertedEvents to the loaded origin
//  - prefer concrete <input> selectors for form fills
// Mutates and returns the recording, plus the retargetUrl helper.
function prepareLoginRecording(recording, { pageUrl, username, password, log = console.log } = {}) {
  const { retargetUrl } = computeRetarget(recording, pageUrl, log);

  if (username || password) {
    let replaced = 0;
    recording.steps.forEach((step, index) => {
      if (step.type === 'change' && step.value) {
        const selectors = JSON.stringify(step.selectors || []).toLowerCase();
        if (username && selectors.includes('username')) { step.value = username; replaced++; log(`  ✓ username -> step ${index + 1}`); }
        else if (password && selectors.includes('password')) { step.value = password; replaced++; log(`  ✓ password -> step ${index + 1}`); }
      }
    });
    log(`✓ Replaced ${replaced} credential value(s)`);
  }

  const originalLen = recording.steps.length;
  recording.steps = recording.steps.filter((step) => {
    if (step.type === 'navigate' && step.url) {
      let pathname = '';
      try { pathname = new URL(step.url).pathname; } catch (e) { /* ignore */ }
      if (pathname.startsWith('/auth/')) {
        log(`  ↷ dropping recorded auth navigation: ${step.url.slice(0, 60)}...`);
        return false;
      }
      step.url = retargetUrl(step.url);
    }
    if (Array.isArray(step.assertedEvents)) {
      step.assertedEvents.forEach((ev) => { if (ev && ev.url) ev.url = retargetUrl(ev.url); });
    }
    return true;
  });

  recording.steps.forEach((step) => {
    if (step.type === 'change' && Array.isArray(step.selectors) && step.selectors.length > 1) {
      step.selectors.sort((a, b) =>
        (JSON.stringify(a).includes('input') ? 0 : 1) - (JSON.stringify(b).includes('input') ? 0 : 1));
    }
  });

  log(`✓ Prepared ${recording.steps.length} steps (removed ${originalLen - recording.steps.length} navigation step(s))`);
  return { recording, retargetUrl };
}

// Run a prepared recording, logging each step so a hang points at the exact
// step rather than a bare "Timed out after 30000ms".
async function runLoginRecording({ browser, page, recording, timeout = 30000, log = console.log }) {
  class LoggingExtension extends PuppeteerRunnerExtension {
    async beforeEachStep(step, flow) {
      this._i = (this._i || 0) + 1;
      const detail = step.url ? step.url : (step.selectors ? JSON.stringify(step.selectors[0]) : '');
      log(`  ▶ step ${this._i}: ${step.type} ${detail}`.slice(0, 160));
      if (super.beforeEachStep) { await super.beforeEachStep(step, flow); }
    }
    async afterEachStep(step, flow) {
      log(`  ✓ step ${this._i} (${step.type}) done`);
      if (super.afterEachStep) { await super.afterEachStep(step, flow); }
    }
  }
  const runner = await createRunner(recording, new LoggingExtension(browser, page, { timeout }));
  await runner.run();
}

// Robust credential login that pierces shadow DOM using standard autocomplete
// attributes (works for Home Assistant and any form using them), then submits.
// Returns true if the page navigated away from the auth page (login accepted).
// This avoids replaying fragile recorded shadow-DOM selectors entirely.
async function smartLogin({ page, username, password, timeout = 15000, log = console.log }) {
  const userSel = 'pierce/input[autocomplete="username"]';
  const passSel = 'pierce/input[autocomplete="current-password"]';

  log('Direct credential login: locating fields (shadow DOM pierced)...');
  const userEl = await page.waitForSelector(userSel, { timeout, visible: true });
  await userEl.click({ clickCount: 3 });
  await userEl.type(String(username), { delay: 15 });
  log('  ✓ username field filled');

  const passEl = await page.waitForSelector(passSel, { timeout, visible: true });
  await passEl.click({ clickCount: 3 });
  await passEl.type(String(password), { delay: 15 });
  log('  ✓ password field filled');

  // Submit with Enter; fall back to clicking a "Log in" button if needed.
  const onAuth = () => /\/auth\//.test(page.url());
  let nav = page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => null);
  await page.keyboard.press('Enter');
  await nav;

  if (onAuth()) {
    log('  Enter did not submit; clicking the "Log in" button...');
    const clicked = await page.evaluate(() => {
      const btns = [];
      const walk = (root) => {
        root.querySelectorAll('ha-button, mwc-button, button').forEach((b) => btns.push(b));
        root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
      };
      walk(document);
      const b = btns.find((x) => (x.textContent || '').trim().toLowerCase() === 'log in');
      if (b) { b.click(); return true; }
      return false;
    });
    if (clicked) { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => null); }
  }

  const success = !onAuth();
  log(`  ${success ? '✓ login accepted' : '✗ still on auth page (check credentials)'} — URL: ${page.url()}`);
  return success;
}

// Inspect the live page (piercing shadow DOM) and list the real form controls,
// so correct selectors can be chosen instead of guessed. Returns an array of
// {tag,type,name,id,ariaLabel,placeholder,autocomplete,text,visible}.
async function probeFormControls(page) {
  return page.evaluate(() => {
    const acc = [];
    const walk = (root) => {
      root.querySelectorAll('input, textarea, button, mwc-button, ha-button, [role="button"]').forEach((el) => acc.push(el));
      root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
    };
    walk(document);
    return acc.map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute && el.getAttribute('type'),
      name: el.getAttribute && el.getAttribute('name'),
      id: el.id || null,
      ariaLabel: el.getAttribute && el.getAttribute('aria-label'),
      placeholder: el.getAttribute && el.getAttribute('placeholder'),
      autocomplete: el.getAttribute && el.getAttribute('autocomplete'),
      text: (el.textContent || '').trim().slice(0, 40),
      visible: !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length)),
    }));
  });
}

module.exports = { computeRetarget, prepareLoginRecording, runLoginRecording, smartLogin, probeFormControls };
