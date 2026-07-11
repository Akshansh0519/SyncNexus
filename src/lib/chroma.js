'use strict'

const { ChromaClient } = require('chromadb')

const client = new ChromaClient({
  path: process.env.CHROMA_URL || 'http://localhost:8000',
})

// Module-level cache — getOrCreateCollection is a network call.
// Caching avoids a round-trip on every RAG query / document ingest.
// Safe: collection name & metadata are static constants, never mutated.
let _collection = null

const logger = require('./logger')

function resetCollectionCache() {
  _collection = null
}

async function getCollection() {
  if (_collection) return _collection

  const maxAttempts = 6
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      _collection = await client.getOrCreateCollection({
        name: 'syncnexus_documents',
        metadata: { description: 'SyncNexus room document chunks' },
      })
      return _collection
    } catch (err) {
      _collection = null
      if (attempt < maxAttempts) {
        const delayMs = attempt * 1500
        logger.warn({ attempt, maxAttempts, delayMs, err: err.message }, 'ChromaDB server waking up or unavailable (`<!DOCTYPE` HTML loading page or network error). Waiting to retry getCollection...')
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else {
        logger.error({ err: err.message, stack: err.stack }, 'Failed to connect to ChromaDB or get collection after retries')
        throw err
      }
    }
  }
}

module.exports = { client, getCollection, resetCollectionCache }
