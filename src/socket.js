'use strict'

const { Server } = require('socket.io')
const { createAdapter } = require('@socket.io/redis-adapter')
const { pubClient, subClient } = require('./lib/redis')
const { socketAuth } = require('./middleware/auth')
const { registerPresenceHandlers } = require('./sockets/presence.handlers')
const { registerTypingHandlers } = require('./sockets/typing.handlers')
const { registerMessageHandlers } = require('./sockets/message.handlers')
const { registerAiHandlers } = require('./sockets/ai.handlers')
const { getClientOrigins } = require('./lib/corsOrigins')
const logger = require('./lib/logger')

/**
 * setupSocket — creates and configures the Socket.IO server.
 *
 * Wired on the /ws namespace. All other namespaces are rejected.
 *
 * Adapter:
 *   Uses @socket.io/redis-adapter which requires TWO separate ioredis
 *   connections — one for PUB, one for SUB — because a client in subscribe
 *   mode cannot issue any other command on that same connection.
 *   (See Complexity Card 1 in syncnexus_master_prompt.md)
 *
 * Auth:
 *   JWT verified once at handshake via io.use(socketAuth).
 *   socket.data.userId is set and trusted by all event handlers without
 *   re-verifying — same pattern as Express trusting req.user after requireAuth.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server} io
 */
function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: getClientOrigins(),
      credentials: true,
    },
    // WebSocket preferred; long-polling fallback requires sticky sessions
    // when using the Redis adapter behind a load balancer.
    transports: ['websocket', 'polling'],
    path: '/ws/socket.io',
  })

  // ── Attach Redis adapter for cross-instance message routing ──────────────
  // Every room-targeted emit is published to Redis Pub/Sub;
  // every other instance subscribes and re-emits to its local sockets.
  io.adapter(createAdapter(pubClient, subClient))

  // ── JWT authentication at handshake ─────────────────────────────────────
  // Runs before any connection event. Rejects with Error('Unauthorized') on failure.
  io.use(socketAuth)

  // ── Connection handler ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    logger.info({ userId: socket.data.userId, socketId: socket.id }, 'Socket connected')

    // Register all event handler groups, passing io + socket + redis
    const { redis } = require('./lib/redis')
    registerPresenceHandlers(io, socket, redis)
    registerTypingHandlers(io, socket, redis)
    registerMessageHandlers(io, socket)
    registerAiHandlers(io, socket)

    socket.on('disconnect', (reason) => {
      logger.info({ userId: socket.data.userId, socketId: socket.id, reason }, 'Socket disconnected')
    })
  })

  logger.info('Socket.IO server initialized with Redis adapter')
  return io
}

module.exports = { setupSocket }
