'use strict'

const mockEmit = jest.fn()
const mockTo = jest.fn(() => ({ emit: mockEmit }))

jest.mock('../src/lib/emitter', () => ({
  to: mockTo,
}))

jest.mock('../src/lib/gemini', () => ({
  geminiClient: null,
}))

jest.mock('../src/services/rag.service', () => ({
  retrieveChunks: jest.fn(async () => ({
    documents: [[
      'SyncNexus uses BullMQ so AI work is retried outside the socket handler.',
    ]],
    metadatas: [[{
      roomId: global.__AI_TEST_ROOM_ID__,
      documentId: 'doc-ai-fixture',
      filename: 'ai-fixture.txt',
      chunkIndex: 0,
    }]],
    distances: [[0.12]],
  })),
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
    `ai-${stamp}@test.com`,
    `ai_${stamp}`,
    'password123'
  )
  userId = user.id

  const room = await createRoom('AI Test Room', false, userId)
  roomId = room.id
  global.__AI_TEST_ROOM_ID__ = roomId
})

function waitForJob(job) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('AI job timed out')), 15000)

    job.waitUntilFinished(aiQueueEvents)
      .then((result) => {
        clearTimeout(timeout)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timeout)
        reject(err)
      })
  })
}

describe('Phase 7 AI answer queue', () => {
  it('processes ai-answer asynchronously, persists an AI message, and emits citations', async () => {
    const job = await aiQueue.add('ai-answer', {
      roomId,
      userId,
      question: 'Why does SyncNexus use BullMQ for AI?',
    })

    const result = await waitForJob(job)

    const message = await prisma.message.findUnique({
      where: { id: result.messageId },
    })

    expect(message).toMatchObject({
      roomId,
      authorId: null,
      type: 'AI',
    })
    expect(message.content).toContain('AI mock answer')
    expect(message.citations[0]).toMatchObject({
      documentId: 'doc-ai-fixture',
      filename: 'ai-fixture.txt',
      chunkIndex: 0,
      rank: 1,
    })
    expect(mockTo).toHaveBeenCalledWith(roomId)
    expect(mockEmit).toHaveBeenCalledWith('ai:answer', {
      message: expect.objectContaining({
        id: result.messageId,
        roomId,
        type: 'AI',
      }),
    })
  }, 30000)
})
