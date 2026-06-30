'use strict'

const express = require('express')
const { asyncHandler } = require('../lib/errors')
const { validateBody, validateQuery } = require('../middleware/validate')
const { requireAuth, requireRoomMember } = require('../middleware/auth')
const { apiRateLimit } = require('../middleware/rateLimiter')
const {
  createRoom,
  listRooms,
  listPublicRooms,
  getRoom,
  joinRoom,
} = require('../services/room.service')
const {
  CreateRoomSchema,
  PaginationSchema,
} = require('../validators')
const { z } = require('zod')

const router = express.Router()

// Apply general API rate limit to all room routes
router.use(requireAuth)
router.use(apiRateLimit)

// POST /api/rooms — create a new room
router.post(
  '/',
  validateBody(CreateRoomSchema),
  asyncHandler(async (req, res) => {
    const { name, isPrivate } = req.body
    const room = await createRoom(name, isPrivate, req.user.userId)
    res.status(201).json(room)
  })
)

// GET /api/rooms — list rooms the user is a member of
router.get(
  '/',
  validateQuery(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) })),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query
    const result = await listRooms(req.user.userId, page, limit)
    res.json(result)
  })
)

// GET /api/rooms/public â€” discover public rooms the user can join
router.get(
  '/public',
  validateQuery(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) })),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query
    const result = await listPublicRooms(req.user.userId, page, limit)
    res.json(result)
  })
)

// GET /api/rooms/:id — get room details + member list
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const room = await getRoom(req.params.id, req.user.userId)
    res.json(room)
  })
)

// POST /api/rooms/:id/join — join a public room
router.post(
  '/:id/join',
  asyncHandler(async (req, res) => {
    await joinRoom(req.params.id, req.user.userId)
    res.status(204).send()
  })
)

// GET /api/rooms/:id/messages — cursor-paginated chat history (Phase 3)
router.get(
  '/:id/messages',
  requireRoomMember,
  validateQuery(PaginationSchema),
  asyncHandler(async (req, res) => {
    const { getMessages } = require('../services/message.service')
    const { cursor, limit } = req.query
    const result = await getMessages(req.params.id, cursor, limit)
    res.json(result)
  })
)

// File routes (Phase 5) — stubbed to avoid import errors
router.use('/:id', require('./file.routes'))

module.exports = router
