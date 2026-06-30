'use strict'

const { safeHandler } = require('../lib/errors')
const { validateEvent } = require('../middleware/validate')
const logger = require('../lib/logger')

/**
 * registerPresenceHandlers — tracks which users are online in each room.
 *
 * Data structure: Redis Hash per room
 *   Key:   presence:{roomId}
 *   Field: socketId (unique per connection/tab)
 *   Value: userId
 *
 * WHY Hash over a plain Set of userIds:
 *   Multi-tab correctness. If a user has 3 tabs open = 3 hash entries.
 *   Closing one tab → HDEL that socketId.
 *   User only goes "offline" when HVALS no longer contains their userId.
 *   A plain Set would mark the user offline when the first tab closes.
 *   (See Complexity Card 2 in syncnexus_master_prompt.md)
 *
 * HSET/HDEL: O(1). HVALS: O(n) where n = sockets in room.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} redis
 */
function registerPresenceHandlers(io, socket, redis) {
  const { RoomJoinSchema } = require('../validators')

  /**
   * Recomputes and broadcasts the deduplicated online user list for a room.
   * Called after every HSET / HDEL.
   */
  async function broadcastPresence(roomId) {
    const values = await redis.hvals(`presence:${roomId}`)
    // Deduplicate: multiple tabs from the same user → one userId in the list
    const onlineUserIds = [...new Set(values)]
    io.to(roomId).emit('presence:update', { roomId, onlineUserIds })
  }

  // On room:join — add this socket to the presence Hash
  socket.on('room:join', safeHandler(socket, async (socket, payload) => {
    const { roomId } = validateEvent(RoomJoinSchema, payload)
    await redis.hset(`presence:${roomId}`, socket.id, socket.data.userId)
    await redis.expire(`presence:${roomId}`, 120) // 2-minute TTL
    // Track which rooms this socket has joined for disconnect cleanup
    socket.data.rooms = socket.data.rooms || new Set()
    socket.data.rooms.add(roomId)
    await broadcastPresence(roomId)
  }))

  // On room:leave — remove this socket from the presence Hash
  socket.on('room:leave', safeHandler(socket, async (socket, payload) => {
    const { roomId } = validateEvent(RoomJoinSchema, payload)
    await redis.hdel(`presence:${roomId}`, socket.id)
    socket.data.rooms?.delete(roomId)
    await broadcastPresence(roomId)
  }))

  // Heartbeat to keep presence alive for active sockets
  const heartbeat = setInterval(async () => {
    const rooms = socket.data.rooms || new Set()
    for (const roomId of rooms) {
      try {
        await redis.expire(`presence:${roomId}`, 120)
      } catch {
        // Silent — best effort TTL refresh
      }
    }
  }, 60_000)

  // On disconnect — clean up all rooms this socket was in
  // Critical: prevents stale "online" state after browser crash / network drop
  socket.on('disconnect', async () => {
    clearInterval(heartbeat)
    const rooms = socket.data.rooms || new Set()
    for (const roomId of rooms) {
      try {
        await redis.hdel(`presence:${roomId}`, socket.id)
        await broadcastPresence(roomId)
      } catch (err) {
        logger.error({ err, roomId, socketId: socket.id }, 'Failed to clean presence on disconnect')
      }
    }
  })
}

module.exports = { registerPresenceHandlers }
