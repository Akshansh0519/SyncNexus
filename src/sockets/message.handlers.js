'use strict'

const { safeHandler } = require('../lib/errors')
const { validateEvent } = require('../middleware/validate')
const { socketRateLimit, SOCKET_MSG_LIMIT } = require('../middleware/rateLimiter')
const { verifyMembership } = require('../services/room.service')
const { createMessage } = require('../services/message.service')
const logger = require('../lib/logger')

/**
 * registerMessageHandlers — wires message:send (and room join/leave) event handlers.
 *
 * message:send flow:
 *   1. Validate payload with Zod (roomId, content)
 *   2. Rate limit: 30 messages/min per user (prevents spam)
 *   3. Verify the user is actually a member of the room (403 if not)
 *   4. Persist message to PostgreSQL via Prisma
 *   5. Broadcast to the room via io.to(roomId).emit()
 *      → With the Redis adapter, this reaches sockets on ALL instances, not just this one
 *
 * All handlers are wrapped in safeHandler because an uncaught rejection inside
 * a Socket.IO event handler silently disappears — no error propagation exists.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerMessageHandlers(io, socket) {
  const { MessageSendSchema, RoomJoinSchema } = require('../validators')

  // room:join — add socket to Socket.IO room channel
  // Presence tracking (Redis Hash) is handled in presence.handlers.js
  socket.on('room:join', safeHandler(socket, async (socket, payload) => {
    const { roomId } = validateEvent(RoomJoinSchema, payload)
    await verifyMembership(roomId, socket.data.userId)
    socket.join(roomId)
    logger.info({ userId: socket.data.userId, roomId }, 'Socket joined room channel')
  }))

  // room:leave — remove socket from Socket.IO room channel
  socket.on('room:leave', safeHandler(socket, async (socket, payload) => {
    const { roomId } = validateEvent(RoomJoinSchema, payload)
    socket.leave(roomId)
    logger.info({ userId: socket.data.userId, roomId }, 'Socket left room channel')
  }))

  // message:send — persist and broadcast a chat message
  socket.on('message:send', safeHandler(socket, async (socket, payload) => {
    const { roomId, content } = validateEvent(MessageSendSchema, payload)

    // Rate limit: 30 messages/min per user
    await socketRateLimit(SOCKET_MSG_LIMIT, socket.data.userId)

    // Authorization: user must be a member of the room
    await verifyMembership(roomId, socket.data.userId)

    // Persist to PostgreSQL
    const message = await createMessage(roomId, socket.data.userId, content)

    // Broadcast to all sockets in the room (across all instances via Redis adapter)
    io.to(roomId).emit('message:new', { message })

    logger.info({ userId: socket.data.userId, roomId, messageId: message.id }, 'Message sent')
  }))
}

module.exports = { registerMessageHandlers }
