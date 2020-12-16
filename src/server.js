#!/bin/env node

const express = require('express');
const bodyParser = require('body-parser');
const ChromeLauncher = require('chrome-launcher');
const _apiPort = parseInt(process.env.API_PORT) || 5011;
const _windowSize = process.env.WINDOW_SIZE || "800,600";
const _windowPosition = process.env.WINDOW_POSITION || "0,0";
const _enableGpu = process.env.ENABLE_GPU || '0';
const _persistentProfile = process.env.PERSISTENT || '0';

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
  ChromeLauncher.killAll().then(() => { 

    var flags = [
      '--no-sandbox',
        '--window-size=' + _windowSize,
        '--window-position=' + _windowPosition,
        '--autoplay-policy=no-user-gesture-required',
        '--noerrdialogs',
        '--disable-session-crashed-bubble',
        '--check-for-update-interval=31536000',
        '--disable-dev-shm-usage'
    ];

    if (_enableGpu != '1')
    {
      flags.push('--disable-gpu')
    }

    if (_persistentProfile == '1')
    {
      flags.push('--user-data-dir=/data')
    }

    ChromeLauncher.launch({
      startingUrl: url,
      chromeFlags: flags,
      port:35173 //this is the remote debugging port
    }).then(chrome => {
      console.log(`Chrome debugging port running on ${chrome.port}`);
    });
});
}

var url = Scan();
Launch(url);
const app = express();

const errorHandler = (err, req, res, next) => {
  res.status(500);
  res.render('error', {
    error: err
  });
};

// app.use(compression());
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

  Launch(req.body.url);
  return res.status(200).send('ok');
});

app.listen(_apiPort, () => {
  console.log('server listening on port ' + _apiPort);
});

process.on('SIGINT', () => {
  process.exit();
});