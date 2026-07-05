'use strict'

const { Worker } = require('bullmq')
const Redis = require('ioredis')
const prisma = require('../../lib/prisma')
const emitter = require('../../lib/emitter')
const logger = require('../../lib/logger')
const { getObjectBuffer } = require('../../lib/s3')
const { batchEmbed, chunkText, extractText, ingestChunks } = require('../../services/rag.service')

function getBucket() {
  return process.env.MINIO_BUCKET || 'syncnexus-files'
}

const workerConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

const ingestDocumentWorker = new Worker(
  'document-ingestion',
  async (job) => {
    const { documentId } = job.data

    // Guard against stale jobs from previous test runs referencing deleted documents
    const existing = await prisma.document.findUnique({ where: { id: documentId } })
    if (!existing) {
      logger.warn({ documentId }, 'Skipping ingestion for missing document')
      return { skipped: true }
    }

    const document = await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' },
    })

    try {
      const buffer = await getObjectBuffer(getBucket(), document.storageKey)
      const text = await extractText(buffer, document.mimeType)
      const chunks = chunkText(text, { size: 800, overlap: 100 })
      
      const embeddings = await batchEmbed(chunks, (percent) => {
        emitter.to(document.roomId).emit('document:progress', {
          documentId: document.id,
          percent,
        })
      })

      const chunkCount = await ingestChunks(document.roomId, document.id, chunks, embeddings, {
        filename: document.filename,
      })

      const updated = await prisma.document.update({
        where: { id: document.id },
        data: { status: 'READY', chunkCount },
      })

      emitter.to(document.roomId).emit('document:ready', {
        document: {
          id: updated.id,
          roomId: updated.roomId,
          uploadedById: updated.uploadedById,
          filename: updated.filename,
          mimeType: updated.mimeType,
          sizeBytes: updated.sizeBytes,
          status: updated.status,
          chunkCount: updated.chunkCount,
          createdAt: updated.createdAt,
        },
      })

      logger.info({ documentId: document.id, chunkCount }, 'Document ingestion completed')
      return { chunkCount }
    } catch (err) {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'FAILED' },
      })
      emitter.to(document.roomId).emit('document:failed', {
        documentId: document.id,
        error: err.message,
      })
      logger.error({ err, documentId: document.id }, 'Document ingestion failed')
      throw err
    }
  },
  {
    connection: workerConnection,
    concurrency: 2,
  }
)

module.exports = { ingestDocumentWorker, workerConnection }
