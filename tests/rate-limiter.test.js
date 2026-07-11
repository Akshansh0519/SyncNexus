'use strict'

process.env.RATE_LIMIT_TEST_ENABLED = 'true'

const EventEmitter = require('events')
const request = require('supertest')
const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')
const createApp = require('../src/app')
const { register } = require('../src/services/auth.service')
const { createRoom } = require('../src/services/room.service')
const { registerMessageHandlers } = require('../src/sockets/message.handlers')

class FakeSocket extends EventEmitter {
  constructor(userId) {
    super()
    this.id = 'fake-message-socket'
    this.data = { userId }
    this.joinedRooms = new Set()
    this.serverErrors = []
  }

  emit(event, payload) {
    if (['message:send', 'room:join', 'room:leave'].includes(event)) {
      return super.emit(event, payload)
    }

    if (event === 'error') {
      this.serverErrors.push(payload)
      return super.emit('server:error', payload)
    }

    return super.emit(event, payload)
  }

  join(roomId) {
    this.joinedRooms.add(roomId)
  }

  leave(roomId) {
    this.joinedRooms.delete(roomId)
  }
}

function waitFor(assertion, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const tick = () => {
      try {
        assertion()
        resolve()
      } catch (err) {
        if (Date.now() - startedAt > timeoutMs) {
          reject(err)
          return
        }
        setTimeout(tick, 25)
      }
    }

    tick()
  })
}

async function clearRateLimitKeys() {
  const keys = await redis.keys('rl:*')
  if (keys.length) await redis.del(keys)
}

beforeAll(async () => {
  await prisma.$connect()
  await redis.connect()
})

afterAll(async () => {
  await clearRateLimitKeys()
  await prisma.$disconnect()
  redis.disconnect()
  delete process.env.RATE_LIMIT_TEST_ENABLED
})

beforeEach(async () => {
  await clearRateLimitKeys()
  await prisma.message.deleteMany()
  await prisma.document.deleteMany()
  await prisma.roomMember.deleteMany()
  await prisma.room.deleteMany()
  await prisma.user.deleteMany()
})

describe('Phase 8 Redis sliding-window rate limiting', () => {
  it('returns 429 with rate-limit headers on the 11th login attempt in one minute', async () => {
    const app = createApp()
    const payload = {
      email: 'missing-user@example.com',
      password: 'password123',
    }

    for (let i = 0; i < 10; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send(payload)

      expect(response.status).not.toBe(429)
      expect(response.headers['x-ratelimit-limit']).toBe('10')
      expect(response.headers['x-ratelimit-remaining']).toBe(String(9 - i))
      expect(response.headers['x-ratelimit-reset']).toBeDefined()
    }

    const limited = await request(app)
      .post('/api/auth/login')
      .send(payload)

    expect(limited.status).toBe(429)
    expect(limited.body).toMatchObject({
      error: 'Too many requests - please slow down',
      code: 'RATE_LIMITED',
    })
    expect(limited.headers['x-ratelimit-limit']).toBe('10')
    expect(limited.headers['x-ratelimit-remaining']).toBe('0')
    expect(limited.headers['x-ratelimit-reset']).toBeDefined()
  }, 30000)

  it('emits an error instead of broadcasting the 31st message:send in one minute', async () => {
    const stamp = Date.now()
    const { user } = await register(
      `rl-socket-${stamp}@test.com`,
      `rl_socket_${stamp}`,
      'password123'
    )
    const room = await createRoom('Rate Limit Socket Room', false, user.id)

    const broadcasts = []
    const io = {
      to: (roomId) => ({
        emit: (event, payload) => {
          broadcasts.push({ roomId, event, payload })
        },
      }),
    }
    const socket = new FakeSocket(user.id)
    registerMessageHandlers(io, socket)

    for (let i = 0; i < 30; i++) {
      socket.emit('message:send', {
        roomId: room.id,
        content: `allowed message ${i}`,
      })

      await waitFor(() => {
        expect(broadcasts.length).toBe(i + 1)
      })
    }

    socket.emit('message:send', {
      roomId: room.id,
      content: 'blocked message',
    })

    await waitFor(() => {
      expect(socket.serverErrors).toHaveLength(1)
    })

    expect(socket.serverErrors[0]).toMatchObject({
      message: 'Rate limit exceeded',
    })
    expect(broadcasts).toHaveLength(30)

    const persistedCount = await prisma.message.count({
      where: { roomId: room.id },
    })
    expect(persistedCount).toBe(30)
  }, 30000)
})
