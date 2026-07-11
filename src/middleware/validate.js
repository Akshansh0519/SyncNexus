'use strict'

const { AppError } = require('../lib/errors')

/**
 * validateBody(schema) — Express middleware for REST request body validation.
 * Runs schema.safeParse on req.body. On failure, returns 400 with Zod error details.
 * On success, replaces req.body with the parsed (and stripped of unknown fields) data.
 *
 * Usage: router.post('/path', validateBody(RegisterSchema), handler)
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      })
    }
    req.body = result.data
    next()
  }
}

/**
 * validateQuery(schema) — Express middleware for query parameter validation.
 * Used for pagination and filter params.
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.flatten(),
      })
    }
    req.query = result.data
    next()
  }
}

/**
 * validateEvent(schema, payload) — for Socket.IO event handlers.
 * Throws AppError(400) on failure so safeHandler can catch and emit 'error' to the socket.
 * Does NOT return a middleware — call it directly inside the handler.
 *
 * Usage: const { roomId, content } = validateEvent(MessageSendSchema, payload)
 */
function validateEvent(schema, payload) {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new AppError('Invalid event payload', 400, 'VALIDATION_ERROR')
  }
  return result.data
}

module.exports = { validateBody, validateQuery, validateEvent }
