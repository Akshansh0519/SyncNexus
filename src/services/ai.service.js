'use strict'

const prisma = require('../lib/prisma')
const { geminiClient } = require('../lib/gemini')
const logger = require('../lib/logger')
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
    if (!chunks || chunks.length === 0 || !chunks[0]?.text) {
      return "I examined the documents currently shared in this room, but could not find specific context directly answering your question.\n\n💡 **Tip**: Please make sure your uploaded documents have finished processing (`READY` status) or try rephrasing your query."
    }

    const mainText = chunks[0].text.trim()
    const additionalChunks = chunks.slice(1, 3).filter(c => c.text?.trim())

    let response = `Here is what I found in your room documents regarding your question:\n\n`
    response += `### 📄 Key Document Insights\n\n`
    response += `${mainText}\n\n`

    if (additionalChunks.length > 0) {
      response += `### 📌 Additional Relevant Details\n\n`
      for (const chunk of additionalChunks) {
        response += `• ${chunk.text.trim().slice(0, 300)}...\n\n`
      }
    }

    response += `---\n*Synthesized directly from your room's verified knowledge base.*`
    return response
  }

  if (!geminiClient || !geminiClient.models) {
    return fallbackAnswer()
  }

  const context = buildContext(chunks)

  try {
    const response = await geminiClient.models.generateContent({
      model: process.env.LLM_MODEL || 'gemini-2.5-flash',
      contents: `Question:\n${question}\n\nContext:\n${context}`,
      config: {
        systemInstruction: [
          'You are SyncNexus AI, an intelligent collaborative research assistant built directly into the shared room workspace.',
          'Answer user questions accurately, concisely, and beautifully using rich Markdown formatting (bullet points, bold text, clear sections) based strictly on the provided SyncNexus document context.',
          'If the answer cannot be found in the provided context, politely inform the user that the room documents do not contain that information.',
          'Do not invent citations or external URLs; the application automatically attaches interactive citation cards from retrieval metadata below your response.',
        ].join(' '),
        temperature: 0.2,
      },
    })
    return response.text?.trim() || fallbackAnswer()
  } catch (error) {
    logger.warn({ err: error }, `Gemini LLM call failed, falling back to document synthesis: ${error.message || error}`)
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
