'use strict'

const { Emitter } = require('@socket.io/redis-emitter')
const { redis } = require('./redis')

const emitter = new Emitter(redis)

module.exports = emitter
