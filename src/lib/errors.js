'use strict'

const logger = require('./logger')

/**
 * AppError — operational errors with an HTTP status code.
 * The global error handler checks instanceof AppError to decide
 * whether to expose the message to the client.
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode || 500
    this.code = code || null
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * asyncHandler — wraps async Express route handlers.
 * Without this, a rejected promise in an async route handler hangs the
 * request forever (Express 4 does not catch async errors automatically).
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * safeHandler — wraps async Socket.IO event handlers.
 * Unlike Express, Socket.IO has NO built-in error middleware.
 * An uncaught rejection inside a socket.on('event', async () => {}) handler
 * silently disappears — the client gets no response and nothing is logged.
 *
 * Socket.IO calls event callbacks with (payload, ack) — NOT (socket, payload).
 * This wrapper captures socket via closure so handlers get a consistent
 * (socket, payload) signature without fragile .bind() hacks.
 *
 * Usage: socket.on('event', safeHandler(socket, async (socket, payload) => { ... }))
 */
function safeHandler(socket, fn) {
  return async (payload) => {
    try {
      await fn(socket, payload)
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Something went wrong'
      socket.emit('error', { message })
      logger.error({ err, event: fn.name || 'unknown' }, 'Socket handler error')
    }
  }
}

module.exports = { AppError, asyncHandler, safeHandler }
