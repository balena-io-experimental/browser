#!/bin/env node

const express = require('express');
const bodyParser = require('body-parser');
const chromeLauncher = require('chrome-launcher');

const API_PORT = parseInt(process.env.API_PORT) || 5011;
const WINDOW_SIZE = process.env.WINDOW_SIZE || "800,600";
const WINDOW_POSITION = process.env.WINDOW_POSITION || "0,0";
const PERSISTENT_DATA = process.env.PERSISTENT || '0';
const REMOTE_DEBUG_PORT = process.env.REMOTE_DEBUG_PORT || 35173;
var DEFAULT_FLAGS = [];

var enableGpu = process.env.ENABLE_GPU || '0';
var currentUrl = '';
var kioskMode = process.env.KIOSK || '0';

let Scan = function() {
  var launchUrl = process.env.LAUNCH_URL || null;
  if (null != launchUrl)
  {
    return launchUrl;
  }

  //TODO: find local services

  return "file:///home/chromium/index.html";
}

let Launch = function(url) {
  chromeLauncher.killAll().then(() => { 

    var flags = 
      [
        '--no-sandbox',
        '--window-size=' + WINDOW_SIZE,
        '--window-position=' + WINDOW_POSITION,
        '--autoplay-policy=no-user-gesture-required',
        '--noerrdialogs',
        '--disable-session-crashed-bubble',
        '--check-for-update-interval=31536000',
        '--disable-dev-shm-usage'
        
    ];

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

let SetDefaultFlags = function() {
  DEFAULT_FLAGS = [...chromeLauncher.Launcher.defaultFlags().filter(flag => flag !== '--disable-extensions' && flag !== '--mute-audio')]
}

//SetDefaultFlags(); //TODO: fix this
var url = Scan();
Launch(url);
const app = express();
console.log("Browser block running....")

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

  Launch(url);
  return res.status(200).send('ok');
});

app.get('/url/get', (req, res) => {
    
  return res.status(200).send(currentUrl);
});

app.post('/refresh', (req, res) => {
 
  Launch(currentUrl);
  return res.status(200).send('ok');
});

app.post('/gpu/set', (req, res) => {
  if (!req.body.gpu) {
    return res.status(400).send('Bad Request');
  }

  enableGpu = req.body.gpu;
  Launch(currentUrl);
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
  Launch(currentUrl);
  return res.status(200).send('ok');
});

app.get('/kiosk/get', (req, res) => {
    
  return res.status(200).send(kioskMode);
});

app.post('/scan', (req, res) => {
 
  var url = Scan();
  Launch(url);
  return res.status(200).send('ok');
});

app.listen(API_PORT, () => {
  console.log('server listening on port ' + API_PORT);
});

process.on('SIGINT', () => {
  process.exit();
});