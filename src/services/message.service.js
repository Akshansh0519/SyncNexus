'use strict'

const prisma = require('../lib/prisma')

/**
 * getMessages — cursor/keyset pagination for chat history.
 *
 * WHY cursor over OFFSET:
 *   OFFSET shifts under concurrent inserts — in a live chat room, new messages
 *   cause duplicates and gaps when paging. Cursor anchors to a specific message's
 *   (createdAt, id) tuple, stable regardless of concurrent writes.
 *   Query is O(log n) via the composite index @@index([roomId, createdAt, id]).
 *   (See Complexity Card 4 in syncnexus_master_prompt.md)
 *
 * DO NOT replace with OFFSET/LIMIT — that is explicitly banned in the spec.
 */
async function getMessages(roomId, cursor, limit = 50) {
  const decoded = cursor
    ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))
    : null

  const messages = await prisma.message.findMany({
    where: {
      roomId,
      ...(decoded && {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          {
            createdAt: new Date(decoded.createdAt),
            id: { lt: decoded.id },
          },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
    },
  })

  const nextCursor =
    messages.length === limit
      ? Buffer.from(
          JSON.stringify({
            createdAt: messages[messages.length - 1].createdAt,
            id: messages[messages.length - 1].id,
          })
        ).toString('base64')
      : null

  return {
    messages: messages.map(formatMessage).reverse(), // return oldest-first for display
    nextCursor,
  }
}

/**
 * createMessage — persists a chat message.
 * Used by the message:send socket handler.
 */
async function createMessage(roomId, authorId, content) {
  const message = await prisma.message.create({
    data: { roomId, authorId, content, type: 'USER' },
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
    },
  })
  return formatMessage(message)
}

/**
 * formatMessage — shapes a Prisma message into the API response format.
 */
function formatMessage(message) {
  return {
    id: message.id,
    roomId: message.roomId,
    authorId: message.authorId,
    authorUsername: message.author?.username ?? null,
    authorAvatar: message.author?.avatarUrl ?? null,
    type: message.type,
    content: message.content,
    citations: message.citations ?? null,
    createdAt: message.createdAt,
  }
}

module.exports = { getMessages, createMessage, formatMessage }
