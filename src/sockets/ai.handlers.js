'use strict'

const { safeHandler } = require('../lib/errors')
const { validateEvent } = require('../middleware/validate')
const { socketRateLimit, SOCKET_AI_LIMIT } = require('../middleware/rateLimiter')
const { verifyMembership } = require('../services/room.service')
const { aiQueue } = require('../queues/aiQueue')
const logger = require('../lib/logger')

/**
 * ai:ask validates and authorizes the question, then enqueues work.
 *
 * The handler deliberately does not call embeddings or the LLM inline. Those
 * calls are slow and failure-prone, so BullMQ owns retries and the worker emits
 * the final ai:answer through the Redis Socket.IO emitter.
 */
function registerAiHandlers(_io, socket) {
  const { AiAskSchema } = require('../validators')

  socket.on('ai:ask', safeHandler(socket, async (socket, payload) => {
    const { roomId, question } = validateEvent(AiAskSchema, payload)

    await socketRateLimit(SOCKET_AI_LIMIT, socket.data.userId)
    await verifyMembership(roomId, socket.data.userId)

    const job = await aiQueue.add('ai-answer', {
      roomId,
      question,
      userId: socket.data.userId,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })

    logger.info({ userId: socket.data.userId, roomId, jobId: job.id }, 'AI question queued')

    socket.emit('ai:queued', {
      roomId,
      jobId: job.id,
    })
  }))
}

module.exports = { registerAiHandlers }
