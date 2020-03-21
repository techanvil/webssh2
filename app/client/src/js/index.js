'use strict'

import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
/* import * as fit from 'xterm/dist/addons/fit/fit'
 */

import { setupSocket } from './setupSocket'

require('xterm/css/xterm.css')
require('../css/style.css')

const term = new Terminal()
// DOM properties
var fitAddon = new FitAddon()
var terminalContainer = document.getElementById('terminal-container')
term.loadAddon(fitAddon)
term.open(terminalContainer)
term.focus()
fitAddon.fit()

setupSocket(term)
