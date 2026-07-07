'use strict'

const { Worker } = require('bullmq')
const Redis = require('ioredis')
const emitter = require('../../lib/emitter')
const logger = require('../../lib/logger')
const { answerQuestion } = require('../../services/ai.service')

const aiWorkerConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

const aiAnswerWorker = new Worker(
  'ai-answer',
  async (job) => {
    const { roomId, question, userId } = job.data

    try {
      const message = await answerQuestion(roomId, question)

      emitter.to(roomId).emit('ai:answer', { message })
      logger.info({ roomId, userId, messageId: message.id }, 'AI answer completed')

      return { messageId: message.id }
    } catch (err) {
      logger.error({ err, roomId, userId }, 'AI answer failed')

      const attempts = job.opts.attempts || 1
      const isFinalAttempt = job.attemptsMade + 1 >= attempts
      if (isFinalAttempt) {
        emitter.to(roomId).emit('ai:error', {
          roomId,
          error: 'AI answer failed after retries.',
        })
      }

      throw err
    }
  },
  {
    connection: aiWorkerConnection,
    concurrency: 2,
  }
)

module.exports = { aiAnswerWorker, aiWorkerConnection }
