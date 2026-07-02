'use strict'

const express = require('express')
const { asyncHandler } = require('../lib/errors')
const { validateBody } = require('../middleware/validate')
const { requireRoomMember } = require('../middleware/auth')
const { ConfirmUploadSchema, PresignSchema } = require('../validators')
const {
  confirmUpload,
  getDocuments,
  getDownloadUrl,
  presignUpload,
} = require('../services/file.service')

const router = express.Router({ mergeParams: true })

router.use(requireRoomMember)

router.post(
  '/files/presign',
  validateBody(PresignSchema),
  asyncHandler(async (req, res) => {
    const result = await presignUpload(req.params.id, req.user.userId, req.body)
    res.json(result)
  })
)

router.post(
  '/files/confirm',
  validateBody(ConfirmUploadSchema),
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
