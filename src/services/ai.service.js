'use strict'

const prisma = require('../lib/prisma')
const { geminiClient } = require('../lib/gemini')
const { retrieveChunks } = require('./rag.service')
const { formatMessage } = require('./message.service')

const MAX_CONTEXT_CHARS = 6000

function flattenRetrievalResults(results) {
  const documents = results.documents?.[0] || []
  const metadatas = results.metadatas?.[0] || []
  const distances = results.distances?.[0] || []

  return documents.map((text, index) => ({
    text,
    metadata: metadatas[index] || {},
    distance: distances[index] ?? null,
  }))
}

function buildCitations(chunks) {
  return chunks.map((chunk, index) => ({
    documentId: chunk.metadata.documentId,
    filename: chunk.metadata.filename,
    chunkIndex: chunk.metadata.chunkIndex,
    page: chunk.metadata.page ?? null,
    rank: index + 1,
    distance: chunk.distance,
    snippet: chunk.text.slice(0, 240),
  }))
}

function buildContext(chunks) {
  let total = 0
  const parts = []

  for (const chunk of chunks) {
    const label = [
      `Document: ${chunk.metadata.filename || 'unknown'}`,
      `Chunk: ${chunk.metadata.chunkIndex ?? 'unknown'}`,
      chunk.metadata.page ? `Page: ${chunk.metadata.page}` : null,
    ].filter(Boolean).join(', ')

    const block = `[${label}]\n${chunk.text}`
    if (total + block.length > MAX_CONTEXT_CHARS) break
    total += block.length
    parts.push(block)
  }

  return parts.join('\n\n---\n\n')
}

async function callLlm(question, chunks) {
  const fallbackAnswer = () => {
    const strongest = chunks[0]?.text || ''
    return [
      'AI mock answer (Document Synthesis):',
      strongest
        ? `Based on the retrieved room documents: "${strongest.slice(0, 500)}..."`
        : 'I could not find relevant document context for that question.',
    ].join(' ')
  }

  if (!geminiClient) {
    return fallbackAnswer()
  }

  const context = buildContext(chunks)

  try {
    const response = await geminiClient.models.generateContent({
      model: process.env.LLM_MODEL || 'gemini-2.5-flash',
      contents: `Question:\n${question}\n\nContext:\n${context}`,
      config: {
        systemInstruction: [
          'You answer questions only from the provided SyncNexus document context.',
          'If the answer is not in the context, say you do not know from the uploaded documents.',
          'Do not invent citations; the application attaches citations from retrieval metadata.',
        ].join(' '),
        temperature: 0.2,
      },
    })
    return response.text?.trim() || fallbackAnswer()
  } catch (error) {
    console.warn('Gemini LLM call failed, falling back to document synthesis:', error.message || error)
    if (error?.status === 429 || error?.message?.includes('quota')) {
      return 'I am currently receiving too many requests (API quota exceeded). Here is what I found in the documents:\n\n' + fallbackAnswer()
    }
    return fallbackAnswer()
  }
}

async function answerQuestion(roomId, question) {
  const retrieval = await retrieveChunks(roomId, question, 5)
  const chunks = flattenRetrievalResults(retrieval)

  let content
  let citations = []

  if (chunks.length === 0) {
    content = "I couldn't find any relevant documents to answer that. Please make sure documents are uploaded and finished processing in this room!"
  } else {
    citations = buildCitations(chunks)
    content = await callLlm(question, chunks)
  }

  const message = await prisma.message.create({
    data: {
      roomId,
      authorId: null,
      type: 'AI',
      content,
      citations,
    },
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
    },
  })

  return formatMessage(message)
}

module.exports = {
  answerQuestion,
  buildCitations,
  flattenRetrievalResults,
}
