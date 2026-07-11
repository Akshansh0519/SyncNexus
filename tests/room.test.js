'use strict'

const request = require('supertest')
const createApp = require('../src/app')
const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')

let app
let accessToken
let userId

const testUser = {
  email: 'roomtest@example.com',
  username: 'roomtestuser',
  password: 'password123',
}

beforeAll(async () => {
  app = createApp()
  await prisma.$connect()
  await redis.connect()
})

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  await prisma.roomMember.deleteMany()
  await prisma.room.deleteMany()
  await prisma.user.deleteMany()

  // Register + login to get a fresh token
  const res = await request(app).post('/api/auth/register').send(testUser)
  accessToken = res.body.accessToken
  userId = res.body.user.id
})

describe('POST /api/rooms', () => {
  it('creates a room and returns 201', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'My Room', isPrivate: false })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'My Room', isPrivate: false })
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('slug')
    expect(res.body.memberCount).toBe(1) // creator is auto-added
  })

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ name: 'Unauthorized Room' })

    expect(res.status).toBe(401)
  })

  it('returns 400 with empty room name', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/rooms', () => {
  it('lists only rooms the user is a member of', async () => {
    // Create 2 rooms as this user
    await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Room A' })

    await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Room B' })

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body.rooms).toHaveLength(2)
    expect(res.body).toHaveProperty('total', 2)
    expect(res.body).toHaveProperty('pages')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/rooms')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/rooms/public', () => {
  it('lists public rooms the user has not joined and hides private/member rooms', async () => {
    const publicRoom = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Discoverable Room', isPrivate: false })

    await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Hidden Private Room', isPrivate: true })

    const otherRes = await request(app).post('/api/auth/register').send({
      email: 'discoverer@example.com',
      username: 'discoverer',
      password: 'password123',
    })

    const beforeJoin = await request(app)
      .get('/api/rooms/public')
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`)

    expect(beforeJoin.status).toBe(200)
    expect(beforeJoin.body.rooms.map((room) => room.id)).toContain(publicRoom.body.id)
    expect(beforeJoin.body.rooms.every((room) => room.isPrivate === false)).toBe(true)

    await request(app)
      .post(`/api/rooms/${publicRoom.body.id}/join`)
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`)

    const afterJoin = await request(app)
      .get('/api/rooms/public')
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`)

    expect(afterJoin.body.rooms.map((room) => room.id)).not.toContain(publicRoom.body.id)
  })
})

describe('GET /api/rooms/:id', () => {
  let roomId

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Detail Room' })
    roomId = res.body.id
  })

  it('returns room with members for a member', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('members')
    expect(res.body.members).toHaveLength(1)
    expect(res.body.members[0].userId).toBe(userId)
  })

  it('returns 403 for a non-member', async () => {
    // Register another user
    const otherRes = await request(app).post('/api/auth/register').send({
      email: 'other@example.com',
      username: 'otheruser',
      password: 'password123',
    })
    const otherToken = otherRes.body.accessToken

    const res = await request(app)
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('NOT_MEMBER')
  })

  it('returns 404 for non-existent room', async () => {
    const res = await request(app)
      .get('/api/rooms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(404)
  })
})

describe('POST /api/rooms/:id/join', () => {
  let publicRoomId
  let privateRoomId

  beforeEach(async () => {
    const pub = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Public Room', isPrivate: false })
    publicRoomId = pub.body.id

    const priv = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Private Room', isPrivate: true })
    privateRoomId = priv.body.id
  })

  it('allows a non-member to join a public room (204)', async () => {
    const otherRes = await request(app).post('/api/auth/register').send({
      email: 'joiner@example.com',
      username: 'joiner',
      password: 'password123',
    })
    const otherToken = otherRes.body.accessToken

    const res = await request(app)
      .post(`/api/rooms/${publicRoomId}/join`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(204)
  })

  it('returns 409 when already a member', async () => {
    const res = await request(app)
      .post(`/api/rooms/${publicRoomId}/join`)
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ALREADY_MEMBER')
  })

  it('returns 403 for private rooms', async () => {
    const otherRes = await request(app).post('/api/auth/register').send({
      email: 'trypriv@example.com',
      username: 'trypriv',
      password: 'password123',
    })
    const otherToken = otherRes.body.accessToken

    const res = await request(app)
      .post(`/api/rooms/${privateRoomId}/join`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ROOM_PRIVATE')
  })
})
