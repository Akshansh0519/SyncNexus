'use strict'

const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')
const { register } = require('../src/services/auth.service')
const { createRoom } = require('../src/services/room.service')
const { getMessages } = require('../src/services/message.service')

let userId
let roomId

beforeAll(async () => {
  await prisma.$connect()
  await redis.connect()
})

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  await prisma.message.deleteMany()
  await prisma.roomMember.deleteMany()
  await prisma.room.deleteMany()
  await prisma.user.deleteMany()

  const stamp = Date.now()
  const { user } = await register(
    `pagination-${stamp}@test.com`,
    `pagination_${stamp}`,
    'password123'
  )
  userId = user.id

  const room = await createRoom('Pagination Test Room', false, userId)
  roomId = room.id
})

describe('cursor pagination for chat history', () => {
  it('returns every original message exactly once while newer messages are inserted concurrently', async () => {
    const originalCount = 220
    const pageSize = 25
    const baseTime = new Date('2026-01-01T00:00:00.000Z')

    const originalMessages = Array.from({ length: originalCount }, (_, index) => ({
      roomId,
      authorId: userId,
      type: 'USER',
      content: `original-${index}`,
      createdAt: new Date(baseTime.getTime() + index * 1000),
    }))

    await prisma.message.createMany({ data: originalMessages })

    const originalIds = new Set(
      (await prisma.message.findMany({
        where: { roomId, content: { startsWith: 'original-' } },
        select: { id: true },
      })).map((message) => message.id)
    )

    const seenOriginalIds = []
    const seenAllIds = new Set()
    let cursor = null
    let insertedNewer = false

    do {
      const page = await getMessages(roomId, cursor, pageSize)

      for (const message of page.messages) {
        expect(seenAllIds.has(message.id)).toBe(false)
        seenAllIds.add(message.id)
        if (originalIds.has(message.id)) {
          seenOriginalIds.push(message.id)
        }
      }

      if (!insertedNewer) {
        insertedNewer = true
        await prisma.message.createMany({
          data: Array.from({ length: 50 }, (_, index) => ({
            roomId,
            authorId: userId,
            type: 'USER',
            content: `concurrent-new-${index}`,
            createdAt: new Date(baseTime.getTime() + (originalCount + 100 + index) * 1000),
          })),
        })
      }

      cursor = page.nextCursor
    } while (cursor)

    expect(seenOriginalIds).toHaveLength(originalCount)
    expect(new Set(seenOriginalIds).size).toBe(originalCount)

    for (const id of originalIds) {
      expect(seenOriginalIds).toContain(id)
    }
  })
})
