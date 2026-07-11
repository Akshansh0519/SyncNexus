'use strict'

const request = require('supertest')
const createApp = require('../src/app')
const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')

let app

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
  // Clean slate before each test — DB only.
  // NOTE: We do NOT flushdb() here — that would nuke refresh tokens
  // that sibling test files (room.test.js) are actively using when
  // Jest runs all suites in the same process.
  // The rotation test self-contains its own register→use→reuse cycle.
  await prisma.roomMember.deleteMany()
  await prisma.room.deleteMany()
  await prisma.user.deleteMany()
})

describe('POST /api/auth/register', () => {
  const validPayload = {
    email: 'test@example.com',
    username: 'testuser',
    password: 'password123',
  }

  it('returns 201 with user and tokens on valid payload', async () => {
    const res = await request(app).post('/api/auth/register').send(validPayload)

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body.user).toMatchObject({
      email: validPayload.email,
      username: validPayload.username,
    })
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  it('returns 409 on duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validPayload)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, username: 'different' })

    expect(res.status).toBe(409)
    expect(res.body).toHaveProperty('error')
    expect(res.body.code).toBe('DUPLICATE')
  })

  it('returns 409 on duplicate username', async () => {
    await request(app).post('/api/auth/register').send(validPayload)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, email: 'other@example.com' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE')
  })

  it('returns 400 on invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, email: 'not-an-email' })

    expect(res.status).toBe(400)
  })

  it('returns 400 on short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, password: 'short' })

    expect(res.status).toBe(400)
  })

  it('returns 400 on missing username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: validPayload.email, password: validPayload.password })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  const credentials = {
    email: 'login@example.com',
    username: 'loginuser',
    password: 'securepass99',
  }

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(credentials)
  })

  it('returns 200 with tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body.user.email).toBe(credentials.email)
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 on non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'anypass' })

    expect(res.status).toBe(401)
  })

  it('returns 400 on missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: credentials.password })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/refresh', () => {
  let refreshToken

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'refresh@example.com',
      username: 'refreshuser',
      password: 'password123',
    })
    refreshToken = res.body.refreshToken
  })

  it('returns 200 with new token pair on valid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
  })

  it('returns 401 on invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' })

    expect(res.status).toBe(401)
  })

  it('returns 401 on used (rotated) refresh token', async () => {
    // Self-contained: register a unique user just for this test so the
    // rotation result is not polluted by beforeEach's own token.
    const uniqueEmail = `rotation-${Date.now()}@example.com`
    const reg = await request(app).post('/api/auth/register').send({
      email: uniqueEmail,
      username: `rotuser_${Date.now()}`,
      password: 'password123',
    })
    const originalToken = reg.body.refreshToken

    // First use — rotates the token, deletes the Redis key
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: originalToken })
    expect(first.status).toBe(200)

    // Second use of the ORIGINAL token — key was deleted on first use → 401
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: originalToken })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('TOKEN_REVOKED')
  })
})

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('ts')
    expect(res.body).toHaveProperty('uptime')
  })
})
