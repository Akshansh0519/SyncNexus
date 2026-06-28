'use strict'

const express = require('express')
const { asyncHandler } = require('../lib/errors')
const { validateBody } = require('../middleware/validate')
const { authRateLimit } = require('../middleware/rateLimiter')
const { requireAuth } = require('../middleware/auth')
const {
  register,
  login,
  refreshTokens,
  logout,
} = require('../services/auth.service')
const { RegisterSchema, LoginSchema, RefreshSchema } = require('../validators')

const router = express.Router()

// Apply rate limiting to all auth endpoints (brute-force protection)
// 10 requests/min per IP — see Complexity Card 5
router.use(authRateLimit)

// POST /api/auth/register
router.post(
  '/register',
  validateBody(RegisterSchema),
  asyncHandler(async (req, res) => {
    const { email, username, password } = req.body
    const result = await register(email, username, password)
    res.status(201).json(result)
  })
)

// POST /api/auth/login
router.post(
  '/login',
  validateBody(LoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body
    const result = await login(email, password)
    res.json(result)
  })
)

// POST /api/auth/refresh
router.post(
  '/refresh',
  validateBody(RefreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body
    const result = await refreshTokens(refreshToken)
    res.json(result)
  })
)

// POST /api/auth/logout (authenticated)
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await logout(req.user.userId)
    res.status(204).send()
  })
)

module.exports = router
