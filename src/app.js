'use strict'

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const { AppError } = require('./lib/errors')
const { getClientOrigins } = require('./lib/corsOrigins')
const logger = require('./lib/logger')

function createApp() {
  const app = express()

  // ── Security middleware (order matters) ──────────────────────────────────
  // 1. Helmet sets security-related HTTP headers
  app.use(helmet())

  // 2. CORS — allow only the configured frontend origin
  app.use(cors({
    origin: getClientOrigins(),
    credentials: true,
  }))

  // 3. Body parser — 10kb limit prevents oversized payload attacks
  app.use(express.json({ limit: '10kb' }))

  // 4. HTTP request logging (goes after body parsing so it can log body size)
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }))

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      ts: new Date().toISOString(),
      version: require('../package.json').version,
      uptime: Math.floor(process.uptime()),
    })
  })

  // ── Route mounting (added in Phase 1) ────────────────────────────────────
  app.use('/api/auth', require('./routes/auth.routes'))
  app.use('/api/rooms', require('./routes/room.routes'))

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req, _res, next) => {
    next(new AppError('Route not found', 404, 'NOT_FOUND'))
  })

  // ── Global error handler (4-arg — must be LAST middleware) ───────────────
  // Express identifies this as an error handler only when it has exactly 4 args.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        error: err.message,
        ...(err.code && { code: err.code }),
      })
    }

    // Zod validation errors (thrown manually via AppError in validateBody,
    // but keeping this as a safety net)
    if (err.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.flatten(),
      })
    }

    // Unknown / programmer errors — log and return generic message
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

module.exports = createApp
