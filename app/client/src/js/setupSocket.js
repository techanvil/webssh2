'use strict'

import * as io from 'socket.io-client'
/* import * as fit from 'xterm/dist/addons/fit/fit'
 */

var sessionLogEnable = false
var loggedData = false
var sessionLog, sessionFooter, logDate, currentDate, myFile, errorExists
var socket, termid // eslint-disable-line
// DOM properties
// var status = document.getElementById('status')
// var header = document.getElementById('header')
// var dropupContent = document.getElementById('dropupContent')
// var footer = document.getElementById('footer')
// var countdown = document.getElementById('countdown')

export function setupSocket(term) {
  window.addEventListener('resize', resizeScreen, false)

  function resizeScreen () {
    socket.emit('resize', { cols: term.cols, rows: term.rows })
  }

  socket = io.connect({
    path: '/ssh/socket.io'
  })

  term.socket = socket;

  term.onData(function (data) {
    socket.emit('data', data)
  })

  socket.on('data', function (data) {
    term.write(data)
    if (sessionLogEnable) {
      sessionLog = sessionLog + data
    }
  })

  socket.on('connect', function () {
    socket.emit('geometry', term.cols, term.rows)
    socket.emit('resize', { cols: term.cols, rows: term.rows })
  })

  socket.on('setTerminalOpts', function (data) {
    term.setOption('cursorBlink', data.cursorBlink)
    term.setOption('scrollback', data.scrollback)
    term.setOption('tabStopWidth', data.tabStopWidth)
    term.setOption('bellStyle', data.bellStyle)
  })

  socket.on('title', function (data) {
    document.title = data
  })

  //socket.on('menu', function (data) { })

  // socket.on('status', function (data) {
  //   status.innerHTML = data
  // })

  // socket.on('ssherror', function (data) {
  //   status.innerHTML = data
  //   status.style.backgroundColor = 'red'
  //   errorExists = true
  // })

  // socket.on('headerBackground', function (data) {
  //   header.style.backgroundColor = data
  // })

  // socket.on('header', function (data) {
  //   if (data) {
  //     header.innerHTML = data
  //     header.style.display = 'block'
  //     // header is 19px and footer is 19px, recaculate new terminal-container and resize
  //     // FIXME terminalContainer.style.height = 'calc(100% - 38px)'
  //     resizeScreen()
  //   }
  // })

  // socket.on('footer', function (data) {
  //   sessionFooter = data
  //   footer.innerHTML = data
  // })

  // socket.on('statusBackground', function (data) {
  //   status.style.backgroundColor = data
  // })

  //socket.on('allowreplay', function (data) { })

  //socket.on('allowreauth', function (data) { })

  socket.on('disconnect', function (err) {
    // if (!errorExists) {
    //   status.style.backgroundColor = 'red'
    //   status.innerHTML =
    //     'WEBSOCKET SERVER DISCONNECTED: ' + err
    // }
    socket.io.reconnection(false)
    // countdown.classList.remove('active')
  })

  // socket.on('error', function (err) {
  //   if (!errorExists) {
  //     status.style.backgroundColor = 'red'
  //     status.innerHTML = 'ERROR: ' + err
  //   }
  // })

  //socket.on('reauth', function () { })

  // safe shutdown
  // var hasCountdownStarted = false

  // socket.on('shutdownCountdownUpdate', function (remainingSeconds) {
  //   if (!hasCountdownStarted) {
  //     countdown.classList.add('active')
  //     hasCountdownStarted = true
  //   }

  //   countdown.innerText = 'Shutting down in ' + remainingSeconds + 's'
  // })

  term.onTitleChange(function (title) {
    document.title = title
  })

}
