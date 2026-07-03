'use strict'

const { Queue, QueueEvents } = require('bullmq')
const Redis = require('ioredis')

const aiQueueConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

const aiQueue = new Queue('ai-answer', {
  connection: aiQueueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

const aiQueueEvents = new QueueEvents('ai-answer', {
  connection: aiQueueConnection.duplicate(),
})

module.exports = { aiQueue, aiQueueEvents, aiQueueConnection }
