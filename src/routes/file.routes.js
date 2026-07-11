'use strict'

const express = require('express')
const multer = require('multer')
const { asyncHandler } = require('../lib/errors')
const { requireRoomMember } = require('../middleware/auth')
const { ALLOWED_MIME_TYPES } = require('../validators')
const {
  confirmUpload,
  getDocuments,
  getDownloadUrl,
  presignUpload,
  uploadFileDirect,
} = require('../services/file.service')

const router = express.Router({ mergeParams: true })
router.use(requireRoomMember)

// Multer: store in memory (files are uploaded to S3 server-side, max 25 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`))
    }
  },
})

// POST /api/rooms/:id/files/upload — single-step server-proxied upload (bypasses browser CORS)
router.post(
  '/files/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' })
    }
    const document = await uploadFileDirect(
      req.params.id,
      req.user.userId,
      req.file.buffer,
      {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      }
    )
    res.status(201).json(document)
  })
)

// Keep legacy presign+confirm flow for compatibility
router.post(
  '/files/presign',
  asyncHandler(async (req, res) => {
    const { filename, mimeType, sizeBytes } = req.body
    const result = await presignUpload(req.params.id, req.user.userId, { filename, mimeType, sizeBytes })
    res.json(result)
  })
)

router.post(
  '/files/confirm',
  asyncHandler(async (req, res) => {
    const document = await confirmUpload(req.params.id, req.user.userId, req.body)
    res.status(201).json(document)
  })
)

router.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const documents = await getDocuments(req.params.id)
    res.json(documents)
  })
)

router.get(
  '/documents/:docId/download',
  asyncHandler(async (req, res) => {
    const result = await getDownloadUrl(req.params.id, req.params.docId)
    res.json(result)
  })
)

module.exports = router
