'use strict'

const mockEmit = jest.fn()
const mockTo = jest.fn(() => ({ emit: mockEmit }))

jest.mock('../src/lib/emitter', () => ({
  to: mockTo,
}))

jest.mock('../src/services/ai.service', () => ({
  answerQuestion: jest.fn(async () => {
    throw new Error('Simulated LLM failure for retry test')
  }),
}))

const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')
const { register } = require('../src/services/auth.service')
const { createRoom } = require('../src/services/room.service')
const { aiQueue, aiQueueConnection, aiQueueEvents } = require('../src/queues/aiQueue')
const { aiAnswerWorker, aiWorkerConnection } = require('../src/queues/workers/aiAnswer.worker')

let userId
let roomId

beforeAll(async () => {
  delete process.env.GEMINI_API_KEY
  await prisma.$connect()
  await redis.connect()
})

afterAll(async () => {
  await aiQueue.obliterate({ force: true }).catch(() => {})
  await aiQueue.close()
  await aiQueueEvents.close()
  aiQueueConnection.disconnect()
  await aiAnswerWorker.close()
  aiWorkerConnection.disconnect()
  await prisma.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  await aiQueue.drain(true)
  await prisma.message.deleteMany()
  await prisma.document.deleteMany()
  await prisma.roomMember.deleteMany()
  await prisma.room.deleteMany()
  await prisma.user.deleteMany()
  mockEmit.mockClear()
  mockTo.mockClear()

  const stamp = Date.now()
  const { user } = await register(
    `retry-${stamp}@test.com`,
    `retry_${stamp}`,
    'password123'
  )
  userId = user.id

  const room = await createRoom('Retry Test Room', false, userId)
  roomId = room.id
})

describe('Phase 7 AI retry and failure behavior', () => {
  it('retries 3 times with exponential backoff, then emits ai:error on final failure', async () => {
    const job = await aiQueue.add('ai-answer', {
      roomId,
      userId,
      question: 'This question will always fail',
    })

    // Wait for the job to permanently fail after all 3 attempts
    const failedPromise = new Promise((resolve, reject) => {
      let onFailed

      const timeout = setTimeout(() => {
        if (onFailed) aiQueueEvents.off('failed', onFailed)
        reject(new Error('Job did not fail within timeout'))
      }, 30000)

      onFailed = async ({ jobId, failedReason }) => {
        if (jobId === job.id) {
          try {
            const checkJob = await aiQueue.getJob(job.id)
            if (checkJob && checkJob.attemptsMade >= 3) {
              clearTimeout(timeout)
              aiQueueEvents.off('failed', onFailed)
              resolve({ jobId, failedReason })
            }
          } catch {
            // Ignore error when checking job
          }
        }
      }

      aiQueueEvents.on('failed', onFailed)
    })

    const failResult = await failedPromise

    // Verify the job failed with the simulated error
    expect(failResult.failedReason).toContain('Simulated LLM failure')

    // Verify the job's retry configuration
    const failedJob = await aiQueue.getJob(job.id)
    expect(failedJob.opts.attempts).toBe(3)
    expect(failedJob.opts.backoff).toEqual({ type: 'exponential', delay: 2000 })
    expect(failedJob.attemptsMade).toBe(3)

    // Verify ai:error was emitted on the final attempt
    const errorCalls = mockEmit.mock.calls.filter(
      ([event]) => event === 'ai:error'
    )
    expect(errorCalls.length).toBe(1)
    expect(errorCalls[0][1]).toMatchObject({
      roomId,
      error: expect.stringContaining('failed after retries'),
    })
    expect(mockTo).toHaveBeenCalledWith(roomId)
  }, 45000)
})
