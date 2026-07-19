// Lightweight mDNS/DNS-SD helper for the browser block.
//
// Provides two capabilities:
//   1) advertise() - publishes this device's HTTP API on the LAN as an
//      `_http._tcp` service, so it can be found by hostname/Bonjour browsers.
//   2) discoverUrl()/browse() - browses the LAN for HTTP services so the
//      kiosk can auto-open one that another device is advertising.
//
// Uses `bonjour-service`, a pure-JS (multicast-dns) implementation, so there
// is no native code to compile across balena's multiple architectures. With
// `network_mode: host` (see docker-compose.yml) multicast works directly and
// no avahi/D-Bus daemon is required inside the container.

const { Bonjour } = require('bonjour-service');

let bonjour = null;
let published = null;

function getBonjour() {
  if (!bonjour) {
    bonjour = new Bonjour();
  }
  return bonjour;
}

// Build a browser-loadable URL from a discovered service. Prefer an IPv4
// address over the `.local` hostname, since Chromium inside the container
// can't resolve `.local` names without an mDNS NSS resolver.
function serviceToUrl(svc) {
  const ipv4 = (svc.addresses || []).find((a) => a.indexOf(':') === -1);
  const host = ipv4 || svc.host;
  const protocol = svc.port === 443 ? 'https' : 'http';
  return `${protocol}://${host}:${svc.port}`;
}

// Advertise this device's HTTP API as an `_http._tcp` service.
function advertise({ name, port, txt } = {}) {
  const instance = getBonjour();
  published = instance.publish({
    name: name || 'balena-browser',
    type: 'http',
    protocol: 'tcp',
    port,
    txt: txt || {},
  });

  published.on('up', () => {
    console.log(`mDNS: advertising "${published.name}" as _http._tcp on port ${port}`);
  });
  published.on('error', (err) => {
    console.log(`mDNS advertise error: ${err.message}`);
  });

  return published;
}

// Browse the LAN for services of the given type. Resolves with an array of
// discovered services after `timeoutMs`.
function browse({ type = 'http', timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const instance = getBonjour();
    const found = [];
    const browser = instance.find({ type }, (service) => {
      found.push(service);
    });
    setTimeout(() => {
      try { browser.stop(); } catch (e) { /* already stopped */ }
      resolve(found);
    }, timeoutMs);
  });
}

// Discover a single HTTP service on the LAN and return a loadable URL, or null
// if none is found. If `name` is given, only services whose name/fqdn matches
// are considered. Our own advertised service is always ignored.
async function discoverUrl({ type = 'http', name = null, timeoutMs = 5000 } = {}) {
  const services = await browse({ type, timeoutMs });
  const candidates = services.filter((svc) => {
    if (published && svc.name === published.name) return false; // skip ourselves
    if (name && svc.name !== name && (!svc.fqdn || svc.fqdn.indexOf(name) === -1)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return serviceToUrl(candidates[0]);
}

// Tear down advertising and the multicast socket (used on shutdown).
function stop() {
  if (!bonjour) return;
  try { bonjour.unpublishAll(); } catch (e) { /* noop */ }
  try { bonjour.destroy(); } catch (e) { /* noop */ }
  bonjour = null;
  published = null;
}

module.exports = { advertise, browse, discoverUrl, stop, serviceToUrl };
