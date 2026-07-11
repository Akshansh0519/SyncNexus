'use strict'

jest.mock('../src/lib/s3', () => ({
  generateUploadUrl: jest.fn(async (_bucket, key) => `http://minio.local/upload/${encodeURIComponent(key)}`),
  generateDownloadUrl: jest.fn(async (_bucket, key) => `http://minio.local/download/${encodeURIComponent(key)}`),
  ensureBucket: jest.fn(async () => undefined),
  s3: {},
}))

jest.mock('../src/lib/emitter', () => ({
  to: jest.fn(() => ({ emit: jest.fn() })),
}))

const request = require('supertest')
const createApp = require('../src/app')
const prisma = require('../src/lib/prisma')
const { redis } = require('../src/lib/redis')

let app
let accessToken
let roomId
let otherToken

beforeAll(async () => {
  process.env.MINIO_BUCKET = process.env.MINIO_BUCKET || 'syncnexus-files'
  app = createApp()
  await prisma.$connect()
  await redis.connect()
})

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  await prisma.document.deleteMany()
  await prisma.roomMember.deleteMany()
  await prisma.room.deleteMany()
  await prisma.user.deleteMany()

  const owner = await request(app).post('/api/auth/register').send({
    email: 'fileowner@example.com',
    username: 'fileowner',
    password: 'password123',
  })
  accessToken = owner.body.accessToken

  const room = await request(app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Files Room', isPrivate: false })
  roomId = room.body.id

  const other = await request(app).post('/api/auth/register').send({
    email: 'fileother@example.com',
    username: 'fileother',
    password: 'password123',
  })
  otherToken = other.body.accessToken
})

describe('Phase 5 file sharing routes', () => {
  it('presigns an upload URL for a room member', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/files/presign`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        filename: 'project-notes.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      })

    expect(res.status).toBe(200)
    expect(res.body.uploadUrl).toContain('http://minio.local/upload/')
    expect(res.body.storageKey).toMatch(new RegExp(`^rooms/${roomId}/.+-project-notes\\.pdf$`))
    expect(res.body.expiresIn).toBe(300)
  })

  it('rejects presign for non-members before creating any upload URL', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/files/presign`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        filename: 'blocked.txt',
        mimeType: 'text/plain',
        sizeBytes: 32,
      })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('NOT_MEMBER')
  })

  it('confirms a document upload as PENDING and lists it', async () => {
    const storageKey = `rooms/${roomId}/doc-fixture-notes.txt`
    await redis.set(`presign:${storageKey}`, '1', 'EX', 300)

    const confirm = await request(app)
      .post(`/api/rooms/${roomId}/files/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        storageKey,
        filename: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 512,
      })

    expect(confirm.status).toBe(201)
    expect(confirm.body).toMatchObject({
      roomId,
      filename: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 512,
      status: 'PENDING',
      chunkCount: 0,
    })

    const list = await request(app)
      .get(`/api/rooms/${roomId}/documents`)
      .set('Authorization', `Bearer ${accessToken}`)

    expect(list.status).toBe(200)
    expect(list.body).toHaveLength(1)
    expect(list.body[0].id).toBe(confirm.body.id)
  })

  it('confirms an image upload as READY', async () => {
    const storageKey = `rooms/${roomId}/image-fixture.png`
    await redis.set(`presign:${storageKey}`, '1', 'EX', 300)

    const res = await request(app)
      .post(`/api/rooms/${roomId}/files/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        storageKey,
        filename: 'image.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('READY')
  })

  it('returns a presigned download URL for a room document', async () => {
    const document = await prisma.document.create({
      data: {
        roomId,
        uploadedById: (await prisma.user.findUnique({ where: { email: 'fileowner@example.com' } })).id,
        filename: 'download.txt',
        mimeType: 'text/plain',
        sizeBytes: 100,
        storageKey: `rooms/${roomId}/download.txt`,
        status: 'PENDING',
      },
    })

    const res = await request(app)
      .get(`/api/rooms/${roomId}/documents/${document.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body.downloadUrl).toContain('http://minio.local/download/')
    expect(res.body.expiresIn).toBe(3600)
  })

  it('rejects confirm when the storage key belongs to a different room', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/files/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        storageKey: 'rooms/00000000-0000-0000-0000-000000000000/bad.txt',
        filename: 'bad.txt',
        mimeType: 'text/plain',
        sizeBytes: 12,
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_STORAGE_KEY')
  })
})
