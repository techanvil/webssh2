'use strict'
/* jshint esversion: 6, asi: true, node: true */
// app.js

const path = require('path')
const fs = require('fs')
const nodeRoot = path.dirname(require.main.filename)
const configPath = path.join(nodeRoot, 'config.json')
console.log('WebSSH2 service reading config from: ' + configPath)
const express = require('express')
const logger = require('morgan')

// sane defaults if config.json or parts are missing
let config = {
  listen: {
    ip: '0.0.0.0',
    port: 2222
  },
  user: {
    name: null,
    password: null,
    privatekey: null
  },
  ssh: {
    host: null,
    port: 22,
    term: 'xterm-color',
    readyTimeout: 20000,
    keepaliveInterval: 120000,
    keepaliveCountMax: 10,
    allowedSubnets: []
  },
  terminal: {
    cursorBlink: true,
    scrollback: 10000,
    tabStopWidth: 8,
    bellStyle: 'sound'
  },
  header: {
    text: null,
    background: 'green'
  },
  session: {
    name: 'WebSSH2',
    secret: 'mysecret'
  },
  options: {
    challengeButton: true,
    allowreauth: true
  },
  algorithms: {
    kex: [
      'ecdh-sha2-nistp256',
      'ecdh-sha2-nistp384',
      'ecdh-sha2-nistp521',
      'diffie-hellman-group-exchange-sha256',
      'diffie-hellman-group14-sha1'
    ],
    cipher: [
      'aes128-ctr',
      'aes192-ctr',
      'aes256-ctr',
      'aes128-gcm',
      'aes128-gcm@openssh.com',
      'aes256-gcm',
      'aes256-gcm@openssh.com',
      'aes256-cbc'
    ],
    hmac: [
      'hmac-sha2-256',
      'hmac-sha2-512',
      'hmac-sha1'
    ],
    compress: [
      'none',
      'zlib@openssh.com',
      'zlib'
    ]
  },
  serverlog: {
    client: false,
    server: false
  },
  accesslog: false,
  verify: false,
  safeShutdownDuration: 300
}

// test if config.json exists, if not provide error message but try to run
// anyway
try {
  if (fs.existsSync(configPath)) {
    console.log('ephemeral_auth service reading config from: ' + configPath)
    config = require('read-config-ng')(configPath)
  } else {
    console.error('\n\nERROR: Missing config.json for webssh. Current config: ' + JSON.stringify(config))
    console.error('\n  See config.json.sample for details\n\n')
  }
} catch (err) {
  console.error('\n\nERROR: Missing config.json for webssh. Current config: ' + JSON.stringify(config))
  console.error('\n  See config.json.sample for details\n\n')
  console.error('ERROR:\n\n  ' + err)
}

function setupServer (app) {
  const session = require('express-session')({
    secret: config.session.secret,
    name: config.session.name,
    resave: true,
    saveUninitialized: false,
    unset: 'destroy'
  })
  const server = require('http').Server(app)
  const myutil = require('./util')
  myutil.setDefaultCredentials(config.user.name, config.user.password, config.user.privatekey)
  const validator = require('validator')
  const io = require('socket.io')(server, { serveClient: false, path: '/ssh/socket.io' })
  const socket = require('./socket')
  const expressOptions = require('./expressOptions')

  // express
  app.use(safeShutdownGuard)
  app.use(session)
  app.use(myutil.basicAuth)
  if (config.accesslog) app.use(logger('common'))
  app.disable('x-powered-by')

  app.get('/ssh/reauth', function (req, res, next) {
    console.log('get /ssh/reauth')
    const r = req.headers.referer || '/'
    res.status(401).send('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=' + r + '"></head><body bgcolor="#000"></body></html>')
  })

  // eslint-disable-next-line complexity
  // app.get('/ssh/host/:host?', function (req, res, next) {
  app.get('/ssh/connect', function (req, res, next) {
    // capture, assign, and validated variables
    req.session.ssh = {
      host: config.ssh.host,
      port: config.ssh.port,
      localAddress: config.ssh.localAddress,
      localPort: config.ssh.localPort,
      header: {
        name: req.query.header || config.header.text,
        background: req.query.headerBackground || config.header.background
      },
      algorithms: config.algorithms,
      keepaliveInterval: config.ssh.keepaliveInterval,
      keepaliveCountMax: config.ssh.keepaliveCountMax,
      allowedSubnets: config.ssh.allowedSubnets,
      term: (/^(([a-z]|[A-Z]|[0-9]|[!^(){}\-_~])+)?\w$/.test(req.query.sshterm) &&
        req.query.sshterm) || config.ssh.term,
      terminal: {
        cursorBlink: (validator.isBoolean(req.query.cursorBlink + '') ? myutil.parseBool(req.query.cursorBlink) : config.terminal.cursorBlink),
        scrollback: (validator.isInt(req.query.scrollback + '', { min: 1, max: 200000 }) && req.query.scrollback) ? req.query.scrollback : config.terminal.scrollback,
        tabStopWidth: (validator.isInt(req.query.tabStopWidth + '', { min: 1, max: 100 }) && req.query.tabStopWidth) ? req.query.tabStopWidth : config.terminal.tabStopWidth,
        bellStyle: ((req.query.bellStyle) && (['sound', 'none'].indexOf(req.query.bellStyle) > -1)) ? req.query.bellStyle : config.terminal.bellStyle
      },
      allowreplay: config.options.challengeButton || (validator.isBoolean(req.headers.allowreplay + '') ? myutil.parseBool(req.headers.allowreplay) : false),
      allowreauth: config.options.allowreauth || false,
      mrhsession: ((validator.isAlphanumeric(req.headers.mrhsession + '') && req.headers.mrhsession) ? req.headers.mrhsession : 'none'),
      serverlog: {
        client: config.serverlog.client || false,
        server: config.serverlog.server || false
      },
      readyTimeout: (validator.isInt(req.query.readyTimeout + '', { min: 1, max: 300000 }) &&
        req.query.readyTimeout) || config.ssh.readyTimeout
    }
    if (req.session.ssh.header.name) validator.escape(req.session.ssh.header.name)
    if (req.session.ssh.header.background) validator.escape(req.session.ssh.header.background)
    res.sendStatus(200);
  })

  // express error handling
  app.use(function (req, res, next) {
    console.log("Sorry can't find that", req.path)
    res.status(404).send("Sorry can't find that!")
  })

  app.use(function (err, req, res, next) {
    console.error(err.stack)
    res.status(500).send('Something broke!')
  })

  // socket.io
  // expose express session with socket.request.session
  io.use(function (socket, next) {
    console.log('use socket, !!socket.request.res', !!socket.request.res);
    (socket.request.res) ? session(socket.request, socket.request.res, next)
      : next(next)
  })

  // bring up socket
  io.on('connection', (...args) => {
    console.log('connection, args.length', args.length)
    socket(...args)
  })

  // safe shutdown
  let shutdownMode = false
  let shutdownInterval = 0
  let connectionCount = 0

  function safeShutdownGuard (req, res, next) {
    if (shutdownMode) res.status(503).end('Service unavailable: Server shutting down')
    else return next()
  }

  io.on('connection', function (socket) {
    console.log('connection, !!socket', !!socket)
    connectionCount++

    socket.on('disconnect', function () {
      if ((--connectionCount <= 0) && shutdownMode) {
        stop('All clients disconnected')
      }
    })
  })

  const signals = ['SIGTERM', 'SIGINT']
  signals.forEach(signal => process.on(signal, function () {
    if (shutdownMode) stop('Safe shutdown aborted, force quitting')
    else if (connectionCount > 0) {
      const remainingSeconds = config.safeShutdownDuration
      shutdownMode = true

      const message = (connectionCount === 1) ? ' client is still connected'
        : ' clients are still connected'
      console.error(connectionCount + message)
      console.error('Starting a ' + remainingSeconds + ' seconds countdown')
      console.error('Press Ctrl+C again to force quit')

      shutdownInterval = setInterval(function () {
        if ((remainingSeconds--) <= 0) {
          stop('Countdown is over')
        } else {
          io.sockets.emit('shutdownCountdownUpdate', remainingSeconds)
        }
      }, 1000)
    } else stop()
  }))

  // clean stop
  function stop (reason) {
    shutdownMode = false
    if (reason) console.log('Stopping: ' + reason)
    if (shutdownInterval) clearInterval(shutdownInterval)
    io.close()
    server.close()
  }

  return { server, config }
}

module.exports = { setupServer }
