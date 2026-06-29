'use strict'

const Redis = require('ioredis')

// General-purpose Redis client (presence, typing, rate limiting, refresh tokens)
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
})

// Two separate connections required for Socket.IO Redis adapter:
// A client in subscribe mode cannot issue any other command on that connection.
const pubClient = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
})

const subClient = pubClient.duplicate()

redis.on('error', (err) => {
  // Avoid crashing the process on transient Redis errors
  // logger is not imported here to avoid circular dependency — errors surface elsewhere
  process.stderr.write(`[redis] connection error: ${err.message}\n`)
})

pubClient.on('error', (err) => {
  process.stderr.write(`[redis:pub] connection error: ${err.message}\n`)
})

subClient.on('error', (err) => {
  process.stderr.write(`[redis:sub] connection error: ${err.message}\n`)
})

module.exports = { redis, pubClient, subClient }
