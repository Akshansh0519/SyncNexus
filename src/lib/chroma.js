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

class LocalVectorStore {
  constructor() {
    this.records = new Map()
  }

  async upsert({ ids = [], embeddings = [], documents = [], metadatas = [] }) {
    for (let i = 0; i < ids.length; i++) {
      this.records.set(ids[i], {
        id: ids[i],
        embedding: embeddings[i] || [],
        document: documents[i] || '',
        metadata: metadatas[i] || {},
      })
    }
    return true
  }

  async query({ queryEmbeddings = [], nResults = 5, where = {} }) {
    const queryEmb = queryEmbeddings[0] || []
    const all = Array.from(this.records.values()).filter((r) => {
      for (const [key, val] of Object.entries(where || {})) {
        if (r.metadata[key] !== val) return false
      }
      return true
    })

    const scored = all.map((r) => {
      let dot = 0
      let magA = 0
      let magB = 0
      for (let i = 0; i < Math.min(queryEmb.length, r.embedding.length); i++) {
        dot += queryEmb[i] * r.embedding[i]
        magA += queryEmb[i] * queryEmb[i]
        magB += r.embedding[i] * r.embedding[i]
      }
      const sim = (magA && magB) ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0
      return { ...r, distance: 1 - sim }
    })

    scored.sort((a, b) => a.distance - b.distance)
    const top = scored.slice(0, nResults)

    return {
      ids: [top.map((x) => x.id)],
      documents: [top.map((x) => x.document)],
      metadatas: [top.map((x) => x.metadata)],
      distances: [top.map((x) => x.distance)],
    }
  }
}

let _localStore = null

async function getCollection() {
  if (_collection) return _collection
  if (_localStore && process.env.CHROMA_FALLBACK === 'true') return _localStore

  const maxAttempts = 8
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      _collection = await client.getOrCreateCollection({
        name: 'syncnexus_documents',
        metadata: { description: 'SyncNexus room document chunks' },
      })
      return _collection
    } catch (err) {
      _collection = null
      const isHtmlOrConn = err.message?.includes('Unexpected token') || err.message?.includes('<!DOCTYPE') || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'

      if (attempt < maxAttempts && !isHtmlOrConn) {
        const delayMs = attempt * 2000
        logger.warn({ attempt, maxAttempts, delayMs, err: err.message }, 'ChromaDB server waking up or unavailable. Waiting to retry getCollection...')
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else if (attempt === maxAttempts || isHtmlOrConn) {
        logger.warn({ err: err.message }, 'External ChromaDB unavailable or returning HTML (`<!DOCTYPE`). Switching automatically to high-speed zero-latency LocalVectorStore fallback!')
        if (!_localStore) _localStore = new LocalVectorStore()
        return _localStore
      }
    }
  }
}

module.exports = { client, getCollection, resetCollectionCache, LocalVectorStore }
