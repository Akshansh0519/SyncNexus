'use strict'

const crypto = require('crypto')
const { redis } = require('../lib/redis')
const logger = require('../lib/logger')

function shouldSkipRateLimit() {
  return process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_TEST_ENABLED !== 'true'
}

function createRateLimitMember(now) {
  return `${now}:${crypto.randomUUID()}`
}

/**
 * Sliding-window rate limiter using Redis Sorted Sets.
 *
 * WHY not express-rate-limit:
 *   express-rate-limit's default in-memory store is per-process.
 *   With multiple app instances behind a load balancer, each instance
 *   maintains its own counter — a user gets N × limit through (N = instance count).
 *   Redis-backed counter is shared across all instances.
 *
 * Algorithm (same data structure as typing indicators — Card 3 / Card 5):
 *   1. ZREMRANGEBYSCORE — evict entries older than the window
 *   2. ZADD — record this request (score = current timestamp)
 *   3. ZCARD — count requests in the window
 *   4. EXPIRE — auto-cleanup the key after the window expires
 *   5. If count > max → reject with 429
 *
 * @param {Object} options
 * @param {string}  options.prefix    - key prefix (e.g. 'auth', 'api', 'msg')
 * @param {number}  options.max       - max requests allowed in the window
 * @param {number}  options.windowMs  - window size in milliseconds
 * @returns Express middleware
 */
function slidingWindowRateLimit({ prefix, max, windowMs }) {
  return async (req, res, next) => {
    // Skip rate limiting in test environment — all test requests share
    // the same loopback IP so they'd exhaust the counter immediately.
    if (shouldSkipRateLimit()) return next()

    // Use userId for authenticated routes, IP for public ones
    const identifier = req.user?.userId || req.ip || 'anonymous'
    const key = `rl:${prefix}:${identifier}`
    const now = Date.now()
    const windowStart = now - windowMs

    try {
      const pipeline = redis.pipeline()
      pipeline.zremrangebyscore(key, 0, windowStart)           // evict old entries
      pipeline.zadd(key, now, createRateLimitMember(now))       // add current request
      pipeline.zcard(key)                                       // count in window
      pipeline.expire(key, Math.ceil(windowMs / 1000))         // auto-cleanup

      const results = await pipeline.exec()
      const count = results[2][1] // ZCARD result

      // Set rate limit headers for transparency
      res.set('X-RateLimit-Limit', max)
      res.set('X-RateLimit-Remaining', Math.max(0, max - count))
      res.set('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000))

      if (count > max) {
        return res.status(429).json({
          error: 'Too many requests - please slow down',
          code: 'RATE_LIMITED',
        })
      }

      next()
    } catch (err) {
      // Fail open: if Redis is unavailable, allow the request
      // In production: consider fail-closed for auth endpoints
      logger.warn({ err, key }, 'Rate limiter Redis error — failing open')
      next()
    }
  }
}

/**
 * socketRateLimit — for use inside socket event handlers (not Express middleware).
 * Throws if over the limit so safeHandler can catch and emit 'error'.
 *
 * @param {Object} options
 * @param {string}  options.prefix
 * @param {number}  options.max
 * @param {number}  options.windowMs
 * @param {string}  identifier   - userId or IP
 * @returns {Promise<void>} — resolves if allowed, throws AppError if rate limited
 */
async function socketRateLimit({ prefix, max, windowMs }, identifier) {
  if (shouldSkipRateLimit()) return // skip in tests

  const { AppError } = require('../lib/errors')
  const key = `rl:${prefix}:${identifier}`
  const now = Date.now()

  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, 0, now - windowMs)
  pipeline.zadd(key, now, createRateLimitMember(now))
  pipeline.zcard(key)
  pipeline.expire(key, Math.ceil(windowMs / 1000))

  const results = await pipeline.exec()
  const count = results[2][1]

  if (count > max) {
    throw new AppError('Rate limit exceeded', 429, 'RATE_LIMITED')
  }
}

// Pre-configured rate limiter instances (applied in app.js or route files)
const authRateLimit = slidingWindowRateLimit({ prefix: 'auth', max: 10, windowMs: 60_000 })
const apiRateLimit = slidingWindowRateLimit({ prefix: 'api', max: 60, windowMs: 60_000 })

// Socket limits — used with socketRateLimit()
const SOCKET_MSG_LIMIT = { prefix: 'sock:msg', max: 30, windowMs: 60_000 }
const SOCKET_AI_LIMIT = { prefix: 'sock:ai', max: 5, windowMs: 60_000 }

module.exports = {
  slidingWindowRateLimit,
  socketRateLimit,
  authRateLimit,
  apiRateLimit,
  SOCKET_MSG_LIMIT,
  SOCKET_AI_LIMIT,
}
