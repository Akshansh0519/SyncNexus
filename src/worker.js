'use strict'

require('dotenv').config()

const { redis } = require('./lib/redis')
const prisma = require('./lib/prisma')
const logger = require('./lib/logger')

const { ingestDocumentWorker, workerConnection } = require('./queues/workers/ingestDocument.worker')
const { aiAnswerWorker, aiWorkerConnection } = require('./queues/workers/aiAnswer.worker')

async function main() {
  await prisma.$connect()
  await redis.connect()

  // Ensure MinIO bucket exists for document ingestion
  if (process.env.MINIO_BUCKET) {
    const { ensureBucket } = require('./lib/s3')
    await ensureBucket(process.env.MINIO_BUCKET)
  }

  logger.info('SyncNexus worker process started - waiting for jobs')

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Worker shutdown signal received')
    await ingestDocumentWorker.close()
    await aiAnswerWorker.close()
    workerConnection.disconnect()
    aiWorkerConnection.disconnect()
    await prisma.$disconnect()
    redis.disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection — shutting down worker')
  process.exit(1)
})

main().catch((err) => {
  logger.error({ err }, 'Fatal worker startup error')
  process.exit(1)
})
