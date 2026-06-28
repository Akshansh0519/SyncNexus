'use strict'

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { redis } = require('../lib/redis')
const { AppError } = require('../lib/errors')
const logger = require('../lib/logger')

const BCRYPT_ROUNDS = 10
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '7d'
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

/**
 * generateTokens — creates an access/refresh token pair and stores the
 * refresh token hash in Redis with a 7-day TTL.
 *
 * Access token: short-lived (15 min), verified on every protected request.
 * Refresh token: long-lived (7 days), stored in Redis so it can be revoked.
 * Key pattern: refresh:{userId}:{sha256HashPrefix}
 */
async function generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId, type: 'access', jti: crypto.randomUUID() },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

  const refreshToken = jwt.sign(
    { userId, type: 'refresh', jti: crypto.randomUUID() },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  )

  // WHY hash and not slice(0,16):
  // JWT tokens always start with the same base64-encoded header (e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9)
  // so all tokens for the same user would share one Redis key. Using a SHA-256
  // hash of the full token guarantees a unique key per token.
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex').slice(0, 32)
  const tokenKey = `refresh:${userId}:${tokenHash}`
  await redis.set(tokenKey, '1', 'EX', REFRESH_TTL_SECONDS)

  return { accessToken, refreshToken }
}

/**
 * formatUser — strips internal fields before sending to the client.
 */
function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt,
  }
}

/**
 * register — creates a new user account.
 * Throws 409 if email or username is already taken.
 */
async function register(email, username, password) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })

  if (existing) {
    const field = existing.email === email ? 'email' : 'username'
    throw new AppError(`This ${field} is already registered`, 409, 'DUPLICATE')
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const user = await prisma.user.create({
    data: { email, username, passwordHash },
  })

  logger.info({ userId: user.id, username }, 'New user registered')

  const tokens = await generateTokens(user.id)
  return { user: formatUser(user), ...tokens }
}

/**
 * login — verifies credentials and returns a token pair.
 * Throws 401 for invalid credentials (same error for email-not-found and wrong-password
 * to prevent user enumeration attacks).
 */
async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } })

  // Constant-time comparison even when user not found
  if (!user) {
    await bcrypt.hash('dummy-password-to-prevent-timing-attack', BCRYPT_ROUNDS)
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash)
  if (!passwordMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  logger.info({ userId: user.id }, 'User logged in')

  const tokens = await generateTokens(user.id)
  return { user: formatUser(user), ...tokens }
}

/**
 * refreshTokens — validates the refresh token, checks Redis, rotates the token pair.
 * Token rotation: old token is deleted from Redis, new pair is issued.
 * This limits the damage if a refresh token is stolen — it can only be used once.
 */
async function refreshTokens(refreshToken) {
  let decoded
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE')
  }

  // Check Redis — if key doesn't exist, token was already used or revoked
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex').slice(0, 32)
  const tokenKey = `refresh:${decoded.userId}:${tokenHash}`
  const exists = await redis.get(tokenKey)
  if (!exists) {
    throw new AppError('Refresh token has been revoked or already used', 401, 'TOKEN_REVOKED')
  }

  // Rotate: delete old token, issue new pair
  await redis.del(tokenKey)

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
  if (!user) {
    throw new AppError('User not found', 401, 'USER_NOT_FOUND')
  }

  const tokens = await generateTokens(user.id)
  return { user: formatUser(user), ...tokens }
}

/**
 * logout — revokes all refresh tokens for a user.
 * Uses Redis SCAN to find all refresh:{userId}:* keys and deletes them.
 * (Note: SCAN is acceptable here because this is a user-initiated, infrequent action,
 *  not a hot path like typing indicators.)
 */
async function logout(userId) {
  const pattern = `refresh:${userId}:*`
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
    cursor = nextCursor
  } while (cursor !== '0')

  logger.info({ userId }, 'User logged out — all refresh tokens revoked')
}

module.exports = { register, login, refreshTokens, logout, formatUser }
