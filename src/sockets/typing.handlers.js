'use strict'

const { safeHandler } = require('../lib/errors')
const { validateEvent } = require('../middleware/validate')

/**
 * registerTypingHandlers — tracks who is currently typing in each room.
 *
 * Data structure: Redis Sorted Set per room
 *   Key:    typing:{roomId}
 *   Member: userId
 *   Score:  Date.now() + 5000  (expiry timestamp, refreshed on every typing:start)
 *
 * WHY Sorted Set over individual TTL'd keys (e.g. typing:{roomId}:{userId}):
 *   To know who is typing in a room, individual TTL keys would require a
 *   SCAN typing:roomX:* command. Redis docs explicitly warn against SCAN in
 *   hot paths — it's O(N) over the entire keyspace, not just your keys.
 *   The Sorted Set stores all typing state for a room in ONE key.
 *   Read: ZREMRANGEBYSCORE (evict expired) + ZRANGE (remaining) = two O(log n) ops
 *   on a single key. Same data structure pattern as the rate limiter.
 *   (See Complexity Card 3 in syncnexus_master_prompt.md)
 *
 * Auto-expiry: if a browser crashes without sending typing:stop, the score's
 * expiry timestamp ensures the entry is evicted on the next ZREMRANGEBYSCORE.
 * No stale "X is typing..." forever.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} redis
 */
function registerTypingHandlers(io, socket, redis) {
  const { TypingSchema } = require('../validators')
  const TYPING_TTL_MS = 5000 // 5 seconds expiry

  /**
   * Evict expired entries and broadcast current typing users.
   * Always run ZREMRANGEBYSCORE before ZRANGE — never read stale data.
   */
  async function broadcastTyping(roomId) {
    const now = Date.now()
    await redis.zremrangebyscore(`typing:${roomId}`, '-inf', now)
    const typingUserIds = await redis.zrange(`typing:${roomId}`, 0, -1)
    io.to(roomId).emit('typing:update', { roomId, typingUserIds })
  }

  // typing:start — add/refresh userId in the sorted set with a new expiry score
  socket.on('typing:start', safeHandler(socket, async (socket, payload) => {
    const { roomId } = validateEvent(TypingSchema, payload)
    const expiryScore = Date.now() + TYPING_TTL_MS
    await redis.zadd(`typing:${roomId}`, expiryScore, socket.data.userId)
    await broadcastTyping(roomId)
  }))

  // typing:stop — immediately remove userId from the sorted set
  socket.on('typing:stop', safeHandler(socket, async (socket, payload) => {
    const { roomId } = validateEvent(TypingSchema, payload)
    await redis.zrem(`typing:${roomId}`, socket.data.userId)
    await broadcastTyping(roomId)
  }))

  // On disconnect — clean up typing state to prevent stale indicators
  socket.on('disconnect', async () => {
    const rooms = socket.data.rooms || new Set()
    for (const roomId of rooms) {
      try {
        await redis.zrem(`typing:${roomId}`, socket.data.userId)
        await broadcastTyping(roomId)
      } catch {
        // Silent — best effort cleanup on disconnect
      }
    }
  })
}

module.exports = { registerTypingHandlers }
