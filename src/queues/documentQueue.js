'use strict'

const { Queue, QueueEvents } = require('bullmq')
const Redis = require('ioredis')

const documentQueueConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

const documentQueue = new Queue('document-ingestion', {
  connection: documentQueueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

const documentQueueEvents = new QueueEvents('document-ingestion', {
  connection: documentQueueConnection.duplicate(),
})

module.exports = { documentQueue, documentQueueEvents, documentQueueConnection }
