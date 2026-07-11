'use strict'

const EventEmitter = require('events')
const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')
const { register } = require('../src/services/auth.service')
const { createRoom } = require('../src/services/room.service')
const { aiQueue, aiQueueConnection, aiQueueEvents } = require('../src/queues/aiQueue')
const { registerAiHandlers } = require('../src/sockets/ai.handlers')

class FakeSocket extends EventEmitter {
  constructor(userId) {
    super()
    this.data = { userId }
    this.id = 'fake-ai-socket'
  }

  emit(event, payload) {
    if (event === 'ai:ask') return super.emit(event, payload)
    this.lastServerEvent = { event, payload }
    return super.emit(event, payload)
  }
}

let userId
let roomId

beforeAll(async () => {
  await prisma.$connect()
  await redis.connect()
})

afterAll(async () => {
  await aiQueue.close()
  await aiQueueEvents.close()
  aiQueueConnection.disconnect()
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

  const stamp = Date.now()
  const { user } = await register(
    `ai-socket-${stamp}@test.com`,
    `ai_socket_${stamp}`,
    'password123'
  )
  userId = user.id

  const room = await createRoom('AI Socket Test Room', false, userId)
  roomId = room.id
})

describe('ai:ask socket handler', () => {
  it('validates membership and enqueues an ai-answer job without running AI inline', async () => {
    const socket = new FakeSocket(userId)
    registerAiHandlers(null, socket)

    const queued = new Promise((resolve, reject) => {
      socket.once('ai:queued', resolve)
      socket.once('error', reject)
      setTimeout(() => reject(new Error('ai:queued was not emitted')), 5000)
    })

    socket.emit('ai:ask', {
      roomId,
      question: 'What does SyncNexus say about async AI?',
    })

    const payload = await queued
    const job = await aiQueue.getJob(payload.jobId)

    expect(payload.roomId).toBe(roomId)
    expect(job.name).toBe('ai-answer')
    expect(job.data).toMatchObject({
      roomId,
      userId,
      question: 'What does SyncNexus say about async AI?',
    })
    await job.remove()
  }, 10000)
})
