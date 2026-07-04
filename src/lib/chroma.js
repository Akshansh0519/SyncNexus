'use strict'

const { ChromaClient } = require('chromadb')

const client = new ChromaClient({
  path: process.env.CHROMA_URL || 'http://localhost:8000',
})

// Module-level cache — getOrCreateCollection is a network call.
// Caching avoids a round-trip on every RAG query / document ingest.
// Safe: collection name & metadata are static constants, never mutated.
let _collection = null

async function getCollection() {
  if (_collection) return _collection
  _collection = await client.getOrCreateCollection({
    name: 'syncnexus_documents',
    metadata: { description: 'SyncNexus room document chunks' },
  })
  return _collection
}

module.exports = { client, getCollection }
