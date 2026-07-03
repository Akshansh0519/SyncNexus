'use strict'

const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { redis } = require('../lib/redis')
const emitter = require('../lib/emitter')
const { AppError } = require('../lib/errors')
const { ALLOWED_MIME_TYPES } = require('../validators')
const { generateDownloadUrl, generateUploadUrl } = require('../lib/s3')
const { documentQueue } = require('../queues/documentQueue')

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function getBucket() {
  if (!process.env.MINIO_BUCKET) {
    throw new AppError('MINIO_BUCKET is not configured', 500, 'MINIO_BUCKET_MISSING')
  }
  return process.env.MINIO_BUCKET
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'upload'
}

function formatDocument(document) {
  return {
    id: document.id,
    roomId: document.roomId,
    uploadedById: document.uploadedById,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    chunkCount: document.chunkCount,
    createdAt: document.createdAt,
  }
}

function assertAllowedMimeType(mimeType) {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new AppError('Unsupported file type', 400, 'UNSUPPORTED_FILE_TYPE')
  }
}

function assertRoomStorageKey(roomId, storageKey) {
  if (!storageKey.startsWith(`rooms/${roomId}/`)) {
    throw new AppError('Storage key does not belong to this room', 400, 'INVALID_STORAGE_KEY')
  }
}

async function presignUpload(roomId, _userId, { filename, mimeType, sizeBytes }) {
  assertAllowedMimeType(mimeType)

  const safeFilename = sanitizeFilename(filename)
  const storageKey = `rooms/${roomId}/${crypto.randomUUID()}-${safeFilename}`
  const uploadUrl = await generateUploadUrl(getBucket(), storageKey, mimeType, sizeBytes)

  // Track intent in Redis for 5 minutes
  await redis.set(`presign:${storageKey}`, '1', 'EX', 300)

  return {
    uploadUrl,
    storageKey,
    expiresIn: 300,
  }
}

async function confirmUpload(roomId, userId, { storageKey, filename, mimeType, sizeBytes }) {
  assertAllowedMimeType(mimeType)
  assertRoomStorageKey(roomId, storageKey)

  // Verify that the key was actually presigned
  const wasPresigned = await redis.get(`presign:${storageKey}`)
  if (!wasPresigned) {
    throw new AppError('Invalid or expired upload session', 400, 'INVALID_UPLOAD_SESSION')
  }
  await redis.del(`presign:${storageKey}`)

  const status = DOCUMENT_MIME_TYPES.has(mimeType) ? 'PENDING' : 'READY'

  const document = await prisma.document.create({
    data: {
      roomId,
      uploadedById: userId,
      filename: sanitizeFilename(filename),
      mimeType,
      sizeBytes,
      storageKey,
      status,
    },
  })

  const response = formatDocument(document)

  // Phase 6 will enqueue document ingestion here for PENDING documents.
  if (status === 'PENDING') {
    await documentQueue.add('ingest-document', {
      roomId,
      documentId: document.id,
      userId,
    })
  }

  emitter.to(roomId).emit('file:shared', { document: response })

  return response
}

async function getDocuments(roomId) {
  const documents = await prisma.document.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
  })

  return documents.map(formatDocument)
}

async function getDownloadUrl(roomId, docId) {
  const document = await prisma.document.findFirst({
    where: { id: docId, roomId },
  })

  if (!document) {
    throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
  }

  const downloadUrl = await generateDownloadUrl(getBucket(), document.storageKey)

  return {
    downloadUrl,
    expiresIn: 3600,
  }
}

module.exports = {
  presignUpload,
  confirmUpload,
  getDocuments,
  getDownloadUrl,
  formatDocument,
}
