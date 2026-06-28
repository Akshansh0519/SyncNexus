'use strict'

const jwt = require('jsonwebtoken')

/**
 * requireAuth — Express middleware for protected REST routes.
 *
 * Extracts the Bearer token from the Authorization header, verifies it,
 * and attaches req.user = { userId } for downstream handlers.
 *
 * Returns 401 on missing, malformed, expired, or invalid tokens.
 *
 * Why verify only at the middleware level and not per-handler:
 * The same logic as trusting req.user after it's been set once —
 * re-verifying on every handler would be redundant CPU work.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'MISSING_TOKEN' })
  }

  const token = authHeader.slice(7) // strip "Bearer "
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type', code: 'INVALID_TOKEN' })
    }
    req.user = { userId: decoded.userId }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }
}

/**
 * socketAuth — Socket.IO io.use() middleware for the /ws namespace.
 *
 * Unlike REST, there is no "Authorization" header on the WebSocket upgrade.
 * The JWT is passed in socket.handshake.auth.token.
 * Verified once at connection time; socket.data.userId is trusted by all event handlers.
 *
 * Known limitation (honest): if a token is revoked after the socket connects,
 * the existing connection stays alive until the next reconnect.
 * A production system would add periodic token re-validation.
 */
function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token
  if (!token) {
    return next(new Error('Unauthorized: no token provided'))
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    if (decoded.type !== 'access') {
      return next(new Error('Unauthorized: invalid token type'))
    }
    socket.data.userId = decoded.userId
    next()
  } catch {
    next(new Error('Unauthorized: invalid or expired token'))
  }
}

/**
 * requireRoomMember — route-level membership check for room-scoped REST endpoints.
 * Attaches the RoomMember record to req.roomMember for downstream use.
 */
async function requireRoomMember(req, res, next) {
  const prisma = require('../lib/prisma')
  const { AppError: Err } = require('../lib/errors')

  try {
    const member = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: req.params.id,
          userId: req.user.userId,
        },
      },
    })

    if (!member) {
      return next(new Err('You are not a member of this room', 403, 'NOT_MEMBER'))
    }

    req.roomMember = member
    next()
  } catch (err) {
    next(err)
  }
}

module.exports = { requireAuth, socketAuth, requireRoomMember }
