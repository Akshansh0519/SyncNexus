'use strict'

/**
 * Cross-Instance Integration Test - proof for the cross-instance routing bullet.
 *
 * Two HTTP servers share Redis through the Socket.IO Redis adapter. Client A
 * connects to instance A, client B connects to instance B, and a room message
 * sent from A must arrive at B. Presence is also broadcast across instances.
 */

const http = require('http')
const { io: ioClient } = require('socket.io-client')
const { redis, pubClient, subClient } = require('../src/lib/redis')
const prisma = require('../src/lib/prisma')
const createApp = require('../src/app')
const { setupSocket } = require('../src/socket')

let serverA, serverB
let clientA, clientB
let portA, portB
let testUserId, testRoomId, testToken

async function getAvailablePort() {
  return new Promise((resolve) => {
    const server = require('net').createServer()
    server.listen(0, () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

function finishOnce(done) {
  let finished = false
  let timer

  return {
    setTimer(nextTimer) {
      timer = nextTimer
    },
    finish(err) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      done(err)
    },
  }
}

beforeAll(async () => {
  await prisma.$connect()
  await redis.connect()
  await pubClient.connect()
  await subClient.connect()

  const { register } = require('../src/services/auth.service')
  const { createRoom } = require('../src/services/room.service')

  const stamp = Date.now()
  const { user, accessToken } = await register(
    `ci-${stamp}@test.com`,
    `ci_user_${stamp}`,
    'testpassword123'
  )
  testToken = accessToken
  testUserId = user.id

  const room = await createRoom('CI Test Room', false, testUserId)
  testRoomId = room.id

  portA = await getAvailablePort()
  serverA = http.createServer(createApp())
  setupSocket(serverA)
  await new Promise((resolve) => serverA.listen(portA, resolve))

  portB = await getAvailablePort()
  serverB = http.createServer(createApp())
  setupSocket(serverB)
  await new Promise((resolve) => serverB.listen(portB, resolve))
}, 30000)

afterAll(async () => {
  clientA?.disconnect()
  clientB?.disconnect()

  await new Promise((resolve) => serverA?.close(resolve))
  await new Promise((resolve) => serverB?.close(resolve))

  await prisma.roomMember.deleteMany({ where: { userId: testUserId } })
  await prisma.message.deleteMany({ where: { roomId: testRoomId } })
  await prisma.room.deleteMany({ where: { id: testRoomId } })
  await prisma.user.deleteMany({ where: { id: testUserId } })

  await prisma.$disconnect()
  redis.disconnect()
  pubClient.disconnect()
  subClient.disconnect()
}, 15000)

describe('Cross-Instance Message Routing (Redis Adapter Proof)', () => {
  it('delivers a message from instance A to a client on instance B within 2 seconds', (done) => {
    const TIMEOUT_MS = 2000
    const startTime = Date.now()
    const guard = finishOnce(done)

    clientA = ioClient(`http://localhost:${portA}`, {
      path: '/ws/socket.io',
      auth: { token: testToken },
      transports: ['websocket'],
    })

    clientB = ioClient(`http://localhost:${portB}`, {
      path: '/ws/socket.io',
      auth: { token: testToken },
      transports: ['websocket'],
    })

    let connectCount = 0
    const onBothConnected = () => {
      connectCount++
      if (connectCount < 2) return

      clientA.emit('room:join', { roomId: testRoomId })
      clientB.emit('room:join', { roomId: testRoomId })

      setTimeout(() => {
        clientA.emit('message:send', {
          roomId: testRoomId,
          content: 'Cross-instance delivery test',
        })
      }, 200)
    }

    clientA.on('connect', onBothConnected)
    clientB.on('connect', onBothConnected)

    clientB.on('message:new', ({ message }) => {
      const deliveryLatencyMs = Date.now() - startTime

      try {
        expect(message.content).toBe('Cross-instance delivery test')
        expect(message.roomId).toBe(testRoomId)
        expect(deliveryLatencyMs).toBeLessThan(TIMEOUT_MS)

        // eslint-disable-next-line no-console
        console.log(`Cross-instance delivery: ${deliveryLatencyMs}ms (target: <${TIMEOUT_MS}ms)`)
        guard.finish()
      } catch (err) {
        guard.finish(err)
      }
    })

    guard.setTimer(setTimeout(() => {
      guard.finish(new Error(`Message did not arrive on instance B within ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS + 500))
  }, 10000)

  it('presence updates reach both instances when a user joins', (done) => {
    if (!clientA?.connected || !clientB?.connected) {
      return done(new Error('Clients not connected - run after previous test'))
    }

    const guard = finishOnce(done)

    clientB.once('presence:update', ({ roomId, onlineUserIds }) => {
      try {
        expect(roomId).toBe(testRoomId)
        expect(Array.isArray(onlineUserIds)).toBe(true)
        expect(onlineUserIds).toContain(testUserId)
        guard.finish()
      } catch (err) {
        guard.finish(err)
      }
    })

    clientA.emit('room:join', { roomId: testRoomId })

    guard.setTimer(setTimeout(() => {
      guard.finish(new Error('Presence update not received within 2s'))
    }, 2000))
  }, 5000)
})
