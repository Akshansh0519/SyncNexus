'use strict'

require('dotenv').config()

const http = require('http')
const createApp = require('./app')
const prisma = require('./lib/prisma')
const { redis, pubClient, subClient } = require('./lib/redis')
const logger = require('./lib/logger')

const PORT = process.env.PORT || 3000

// ── Startup env validation ───────────────────────────────────────────────────
// Fail fast with a clear message rather than a cryptic error at request time.
function assertRequiredEnv() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET',
    'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET',
  ]

  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    process.stderr.write(`[startup] FATAL — missing required env vars: ${missing.join(', ')}\n`)
    process.exit(1)
  }

  // JWT secrets should be at least 32 chars
  const jwtSecrets = ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET']
  for (const key of jwtSecrets) {
    if (process.env[key].length < 32) {
      process.stderr.write(`[startup] FATAL — ${key} must be at least 32 characters\n`)
      process.exit(1)
    }
  }
}

async function main() {
  // ── Connect to database ──────────────────────────────────────────────────
  await prisma.$connect()
  logger.info('PostgreSQL connected')

  // ── Connect Redis clients ────────────────────────────────────────────────
  await Promise.all([
    redis.connect(),
    pubClient.connect(),
    subClient.connect(),
  ])
  logger.info('Redis connected')

  // ── Ensure MinIO bucket exists (once, not per-request) ────────────────
  if (process.env.MINIO_BUCKET) {
    const { ensureBucket } = require('./lib/s3')
    await ensureBucket(process.env.MINIO_BUCKET)
    logger.info({ bucket: process.env.MINIO_BUCKET }, 'MinIO bucket verified')
  }

  // ── Create HTTP server ───────────────────────────────────────────────────
  const app = createApp()
  const httpServer = http.createServer(app)

  // Wire Socket.IO with Redis adapter (Phase 2)
  const { setupSocket } = require('./socket')
  setupSocket(httpServer)

  // ── NOTE: Background Workers run in a SEPARATE process (src/worker.js) ────
  // Do NOT require workers here — that would cause double job processing
  // when both the 'app' and 'worker' docker-compose services are running.
  // Worker process is started by: `npm run worker` / docker-compose worker service.

  // ── Start listening ──────────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'SyncNexus API server started')
  })

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown signal received')
    httpServer.close(async () => {
      await prisma.$disconnect()
      redis.disconnect()
      pubClient.disconnect()
      subClient.disconnect()
      logger.info('Graceful shutdown complete')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection — shutting down')
  process.exit(1)
})

assertRequiredEnv()
main().catch((err) => {
  logger.error({ err }, 'Fatal startup error')
  process.exit(1)
})
