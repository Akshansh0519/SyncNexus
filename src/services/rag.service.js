'use strict'

const crypto = require('crypto')
const mammoth = require('mammoth')
const pdfParse = require('pdf-parse')
const { geminiClient } = require('../lib/gemini')
const { getCollection } = require('../lib/chroma')

const EMBEDDING_DIMENSIONS = 3072

function splitLongText(text, size) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

function chunkText(text, { size = 800, overlap = 100 } = {}) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!normalized) return []

  const units = normalized.split(/\n\n+|(?<=[.!?])\s+/).flatMap((unit) => (
    unit.length > size ? splitLongText(unit, size) : unit
  ))

  const chunks = []
  let current = ''

  for (const unit of units) {
    const next = current ? `${current} ${unit}` : unit
    if (next.length <= size) {
      current = next
      continue
    }

    if (current) chunks.push(current.trim())
    const tail = current.slice(Math.max(0, current.length - overlap))
    current = tail ? `${tail} ${unit}` : unit
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const parsed = await pdfParse(buffer)
    return parsed.text
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (mimeType === 'text/plain') {
    return buffer.toString('utf8')
  }

  return ''
}

function mockEmbed(text) {
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0)
  const hash = crypto.createHash('sha256').update(text).digest()

  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    vector[i] = (hash[i % hash.length] / 255) * 2 - 1
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => value / magnitude)
}

async function batchEmbed(texts, onProgress) {
  if (!texts.length) return []

  if (!geminiClient) {
    if (onProgress) onProgress(100)
    return texts.map(mockEmbed)
  }

  const responses = []
  const BATCH_SIZE = 10

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const batchResponses = await Promise.all(
      batch.map((text) =>
        geminiClient.models.embedContent({
          model: 'gemini-embedding-001',
          contents: text,
        })
      )
    )
    responses.push(...batchResponses)

    if (onProgress) {
      const percent = Math.min(100, Math.round(((i + BATCH_SIZE) / texts.length) * 100))
      onProgress(percent)
    }

    // Wait 1 second between batches to stay well under the 1500 RPM limit
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return responses.map((response) => response.embeddings[0].values)
}

async function embed(text) {
  const [embedding] = await batchEmbed([text])
  return embedding
}

async function ingestChunks(roomId, documentId, chunks, embeddings, extraMetadata = {}) {
  if (!chunks.length) return 0

  const collection = await getCollection()
  const ids = chunks.map((_, index) => `${documentId}:${index}`)
  const metadatas = chunks.map((_, index) => ({
    roomId,
    documentId,
    chunkIndex: index,
    ...extraMetadata,
  }))

  await collection.upsert({
    ids,
    embeddings,
    documents: chunks,
    metadatas,
  })

  return chunks.length
}

async function retrieveChunks(roomId, question, nResults = 5) {
  const collection = await getCollection()
  const questionEmbedding = await embed(question)

  return collection.query({
    queryEmbeddings: [questionEmbedding],
    nResults,
    where: { roomId },
    include: ['documents', 'metadatas', 'distances'],
  })
}

module.exports = {
  chunkText,
  extractText,
  embed,
  batchEmbed,
  ingestChunks,
  retrieveChunks,
}
