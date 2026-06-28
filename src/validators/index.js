'use strict'

const { z } = require('zod')

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
})

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

const CreateRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(80, 'Room name too long'),
  isPrivate: z.boolean().default(false),
})

const PresignSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` }),
  }),
  sizeBytes: z.number()
    .int()
    .positive()
    .max(25 * 1024 * 1024, 'File size must be at most 25MB'),
})

const ConfirmUploadSchema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive(),
})

const MessageSendSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
  content: z.string()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message is too long (max 4000 characters)'),
})

const AiAskSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
  question: z.string()
    .min(3, 'Question too short')
    .max(1000, 'Question too long (max 1000 characters)'),
})

const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const RoomJoinSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
})

const TypingSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
})

module.exports = {
  ALLOWED_MIME_TYPES,
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  CreateRoomSchema,
  PresignSchema,
  ConfirmUploadSchema,
  MessageSendSchema,
  AiAskSchema,
  PaginationSchema,
  RoomJoinSchema,
  TypingSchema,
}
