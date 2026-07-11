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
    try {
      const { ensureBucket } = require('./lib/s3')
      await ensureBucket(process.env.MINIO_BUCKET)
      logger.info({ bucket: process.env.MINIO_BUCKET }, 'MinIO bucket verified')
    } catch (s3Error) {
      logger.warn({ err: s3Error.message }, 'MinIO bucket verification failed — file uploads disabled until S3 credentials are valid')
    }
  }

  // ── Create HTTP server ───────────────────────────────────────────────────
  const app = createApp()
  const httpServer = http.createServer(app)

  // Wire Socket.IO with Redis adapter (Phase 2)
  const { setupSocket } = require('./socket')
  setupSocket(httpServer)

  // ── Start background workers inline for single-server/free tier deployments ──
  // If START_WORKERS !== 'false', automatically start document ingestion and AI answer workers
  // so everything works seamlessly without requiring a separate background worker service.
  let ingestWorker = null
  let aiWorker = null
  if (process.env.START_WORKERS !== 'false') {
    const { ingestDocumentWorker } = require('./queues/workers/ingestDocument.worker')
    const { aiAnswerWorker } = require('./queues/workers/aiAnswer.worker')
    ingestWorker = ingestDocumentWorker
    aiWorker = aiAnswerWorker
    logger.info('Background workers (ingestDocument, aiAnswer) started inline with web service')
  }

  // ── Start listening ──────────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'SyncNexus API server started')
  })

  // ── Self-Ping Cron (Keep-Alive for Render Free Tier) ──────────────────────
  // Pings both the backend health endpoint and ChromaDB heartbeat every 5 minutes (300,000 ms)
  // so neither container hibernates (`<!DOCTYPE html` loading screens) and is 24/7 fast for recruiters!
  const keepAliveInterval = setInterval(() => {
    // Skip self-ping during local development unless explicitly requested
    if (process.env.NODE_ENV !== 'production' && !process.env.KEEP_ALIVE_URL) return

    const urlsToPing = [
      process.env.KEEP_ALIVE_URL || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/api/health` : 'https://syncnexus-backend.onrender.com/api/health')
    ]
    if (process.env.CHROMA_URL) {
      urlsToPing.push(`${process.env.CHROMA_URL.replace(/\/+$/, '')}/api/v1/heartbeat`)
    }

    for (const targetUrl of urlsToPing) {
      const protocol = targetUrl.startsWith('https') ? require('https') : require('http')
      protocol.get(targetUrl, (res) => {
        if (res.statusCode === 200) {
          logger.info({ url: targetUrl, status: res.statusCode }, 'Keep-alive cron ping successful')
        } else {
          logger.warn({ url: targetUrl, status: res.statusCode }, 'Keep-alive cron ping returned non-200 status')
        }
      }).on('error', (err) => {
        logger.warn({ err: err.message, url: targetUrl }, 'Keep-alive cron ping failed')
      })
    }
  }, 5 * 60 * 1000)
  keepAliveInterval.unref()

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown signal received')
    clearInterval(keepAliveInterval)
    if (ingestWorker) await ingestWorker.close()
    if (aiWorker) await aiWorker.close()
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
