#!/bin/env node

const express = require('express');
const bodyParser = require('body-parser');
const chromeLauncher = require('chrome-launcher');
const bent = require('bent')

const API_PORT = parseInt(process.env.API_PORT) || 5011;
const WINDOW_SIZE = process.env.WINDOW_SIZE || "800,600";
const WINDOW_POSITION = process.env.WINDOW_POSITION || "0,0";
const PERSISTENT_DATA = process.env.PERSISTENT || '0';
const REMOTE_DEBUG_PORT = process.env.REMOTE_DEBUG_PORT || 35173;
const FLAGS = process.env.FLAGS || null;

var DEFAULT_FLAGS = [];
var enableGpu = process.env.ENABLE_GPU || '0';
var currentUrl = '';
var kioskMode = process.env.KIOSK || '0';

// Returns the URL to display, adhering to the hieracrchy:
// 1) the configured LAUNCH_URL
// 2) a discovered HTTP service on the device
// 3) the default static HTML
async function getUrlToDisplayAsync() {
    var launchUrl = process.env.LAUNCH_URL || null;
    if (null != launchUrl)
    {
      launchUrl;
    }

    console.log("LAUNCH_URL not set.")
    console.log("Looking for local HTTP services.")

    // Check each HTTP/S port
    var ports = [80,443,8080];
    var returnURL = null;
    await Promise.all(ports.map(async (port) => 
    {
      var url = '';
      if(port == 443)
      {
        url = 'https://'
      }
      else
      {
        url = 'http://'
      }
      url = url + 'localhost:' + port;
      
      console.log("Trying " + url);

      try 
      {
        //request the URL
        const request = bent(url);
        const response = await request();
        //If OK
        if (200 == response.statusCode)
        {
          console.log("HTTP services found on URL: " + url)
          return url;
        }
      }
      catch(error)
      {
        //TODO: Handle expected connection errors, but re-throw anything else
      }
    })).then((urls) =>
    {
      // An array of the promise resolves will be returned. The discovered services
      // will have their URL in the array. The others will be null.
      var filteredUrls = urls.filter(function (el) {
        // Only keep the non-null items
        return el != null;
      });

      // If we found a URL
      if(filteredUrls.length > 0)
      {
        returnURL = filteredUrls[0];
      }
      // Otherwise send the default HTML
      else
      {
        console.log("Using default HTML page");
       returnURL = "file:///home/chromium/index.html";
      }
    });

    return returnURL;
  }
       
// Launch the browser with the URL specified
let launchChromium = function(url) {
  chromeLauncher.killAll().then(() => { 

    var flags = [];
    // If the user has set the flags, use them
    if (null != FLAGS)
    {
      flags = FLAGS.split(' ');
    }
    else
    {
      // User the default flags from chrome-launcher, plus our own.
      flags = DEFAULT_FLAGS;
      var balenaFlags = [
        '--no-sandbox',
        '--window-size=' + WINDOW_SIZE,
        '--window-position=' + WINDOW_POSITION,
        '--autoplay-policy=no-user-gesture-required',
        '--noerrdialogs',
        '--disable-session-crashed-bubble',
        '--check-for-update-interval=31536000',
        '--disable-dev-shm-usage'
      ];

      flags = flags.concat(balenaFlags);
    }

    if (enableGpu != '1')
    {
      flags.push('--disable-gpu')
    }

    if (PERSISTENT_DATA == '1')
    {
      flags.push('--user-data-dir=/data')
    }

    var startingUrl = url;
    if (kioskMode == '1')
    {
      startingUrl = '--app=' + url
    }

    console.log("Starting Chromium with the following flags: " + flags)

    chromeLauncher.launch({
      startingUrl: startingUrl,
      ignoreDefaultFlags: true,
      chromeFlags: flags,
      port: REMOTE_DEBUG_PORT
    }).then(chrome => {
      console.log(`Chromium debugging port running on ${chrome.port}`);
      currentUrl = url;
    });
  });
}

// Get's the chrome-launcher default flags, minus the extensions and audio muting ones.
async function SetDefaultFlags() {
  DEFAULT_FLAGS =  await chromeLauncher.Launcher.defaultFlags().filter(flag => flag !== '--disable-extensions' && flag !== '--mute-audio');
}

async function main(){
  await SetDefaultFlags();
  var url = await getUrlToDisplayAsync();
  console.log("Scan resulted in " + url)
  launchChromium(url);
}

main().catch("Main error: " + console.log);

// Start the API
const app = express();
console.log("Browser block running.")

const errorHandler = (err, req, res, next) => {
  res.status(500);
  res.render('error', {
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

app.get('/ping', (req, res) => {
    
    return res.status(200).send('ok');
});

app.post('/url/set', (req, res) => {
  if (!req.body.url) {
    return res.status(400).send('Bad URL Request');
  }

  var url = req.body.url;

  if ((!url.toLowerCase().startsWith("http://")) && (!url.toLowerCase().startsWith("https://")))
  {
    url = "http://" + url;
  }

  launchChromium(url);
  return res.status(200).send('ok');
});

app.get('/url/get', (req, res) => {
    
  return res.status(200).send(currentUrl);
});

app.post('/refresh', (req, res) => {
 
  launchChromium(currentUrl);
  return res.status(200).send('ok');
});

app.post('/gpu/set', (req, res) => {
  if (!req.body.gpu) {
    return res.status(400).send('Bad Request');
  }

  enableGpu = req.body.gpu;
  launchChromium(currentUrl);
  return res.status(200).send('ok');
});

app.get('/gpu/get', (req, res) => {
    
  return res.status(200).send(enableGpu);
});

app.post('/kiosk/set', (req, res) => {
  if (!req.body.kiosk) {
    return res.status(400).send('Bad Request');
  }

  kioskMode = req.body.kiosk;
  launchChromium(currentUrl);
  return res.status(200).send('ok');
});

app.get('/kiosk/get', (req, res) => {
    
  return res.status(200).send(kioskMode);
});

app.post('/scan', (req, res) => {
 
  var url = Scan();
  launchChromium(url);
  return res.status(200).send('ok');
});

app.listen(API_PORT, () => {
  console.log('server listening on port ' + API_PORT);
});

process.on('SIGINT', () => {
  process.exit();
});