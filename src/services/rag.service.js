'use strict'

const crypto = require('crypto')
const mammoth = require('mammoth')
const pdfParse = require('pdf-parse')
const { geminiClient } = require('../lib/gemini')
const { getCollection, resetCollectionCache } = require('../lib/chroma')
const logger = require('../lib/logger')

const EMBEDDING_DIMENSIONS = 3072

function splitLongText(text, size) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

function chunkText(text, options = {}) {
  const size = options.size || 500
  const overlap = options.overlap || 50
  const rawChunks = []

  const paragraphs = text.split(/\n\s*\n/)
  let currentChunk = ''

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue

    if (currentChunk.length + trimmed.length + 2 <= size) {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed
    } else {
      if (currentChunk) rawChunks.push(currentChunk)
      if (trimmed.length > size) {
        rawChunks.push(...splitLongText(trimmed, size))
        currentChunk = ''
      } else {
        currentChunk = trimmed
      }
    }
  }
  if (currentChunk) rawChunks.push(currentChunk)

  if (rawChunks.length <= 1 || overlap <= 0) return rawChunks

  const overlapped = [rawChunks[0]]
  for (let i = 1; i < rawChunks.length; i++) {
    const prev = rawChunks[i - 1]
    const tail = prev.slice(-overlap)
    overlapped.push(tail + ' ' + rawChunks[i])
  }
  return overlapped
}

async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const data = await pdfParse(buffer)
    return data.text
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  return buffer.toString('utf8')
}

function generateDummyEmbedding(text) {
  const hash = crypto.createHash('sha256').update(text).digest()
  const values = new Array(EMBEDDING_DIMENSIONS)
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const byte = hash[i % hash.length]
    values[i] = (byte / 255) * 2 - 1
  }
  return values
}

async function batchEmbed(texts, onProgress) {
  if (!texts.length) return []

  if (!geminiClient) {
    logger.debug('Using deterministic fallback embeddings (no GEMINI_API_KEY)')
    return texts.map((t) => generateDummyEmbedding(t))
  }

  const model = geminiClient.getGenerativeModel({ model: 'text-embedding-004' })
  const BATCH_SIZE = 100
  const responses = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const requests = batch.map((text) => ({
      content: { parts: [{ text }] },
    }))

    const result = await model.batchEmbedContents({
      requests,
    })
    responses.push(...result.embeddings)

    if (onProgress) {
      const percent = Math.min(100, Math.round(((i + batch.length) / texts.length) * 100))
      onProgress(percent)
    }

    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return responses.map((r) => r.values)
}

async function embed(text) {
  const [embedding] = await batchEmbed([text])
  return embedding
}

async function ingestChunks(roomId, documentId, chunks, embeddings, extraMetadata = {}) {
  if (!chunks.length) return 0

  const ids = chunks.map((_, index) => `${documentId}:${index}`)
  const metadatas = chunks.map((_, index) => ({
    roomId,
    documentId,
    chunkIndex: index,
    ...extraMetadata,
  }))

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const collection = await getCollection()
      await collection.upsert({
        ids,
        embeddings,
        documents: chunks,
        metadatas,
      })
      return chunks.length
    } catch (err) {
      if (attempt === 1) {
        logger.warn({ err: err.message }, 'Collection upsert failed, clearing collection cache and retrying once...')
        resetCollectionCache()
        continue
      }
      throw err
    }
  }
}

async function retrieveChunks(roomId, question, nResults = 5) {
  const questionEmbedding = await embed(question)

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const collection = await getCollection()
      return await collection.query({
        queryEmbeddings: [questionEmbedding],
        nResults,
        where: { roomId },
        include: ['documents', 'metadatas', 'distances'],
      })
    } catch (err) {
      if (attempt === 1) {
        logger.warn({ err: err.message }, 'Collection query failed, clearing collection cache and retrying once...')
        resetCollectionCache()
        continue
      }
      throw err
    }
  }
}

module.exports = {
  chunkText,
  extractText,
  embed,
  batchEmbed,
  ingestChunks,
  retrieveChunks,
}
