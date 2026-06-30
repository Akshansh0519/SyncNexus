'use strict'

const prisma = require('../lib/prisma')
const { AppError } = require('../lib/errors')
const logger = require('../lib/logger')

/**
 * slugify — converts a room name to a URL-safe slug.
 * Appends a random suffix to prevent collisions.
 */
function slugify(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`
}

/**
 * formatRoom — strips internal fields, adds memberCount.
 */
function formatRoom(room, memberCount) {
  return {
    id: room.id,
    name: room.name,
    slug: room.slug,
    isPrivate: room.isPrivate,
    ownerId: room.ownerId,
    memberCount: memberCount ?? room._count?.members ?? 0,
    createdAt: room.createdAt,
  }
}

/**
 * createRoom — creates a room and automatically adds the creator as OWNER member.
 * The creator is always a member; they should not need to join separately.
 */
async function createRoom(name, isPrivate, userId) {
  const slug = slugify(name)

  const room = await prisma.room.create({
    data: {
      name,
      slug,
      isPrivate,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: 'OWNER',
        },
      },
    },
    include: {
      _count: { select: { members: true } },
    },
  })

  logger.info({ roomId: room.id, userId, name }, 'Room created')
  return formatRoom(room)
}

/**
 * listRooms — returns rooms the user is a member of, paginated.
 */
async function listRooms(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.room.count({
      where: { members: { some: { userId } } },
    }),
  ])

  return {
    rooms: rooms.map((r) => formatRoom(r)),
    total,
    page,
    pages: Math.ceil(total / limit),
  }
}

/**
 * listPublicRooms â€” returns joinable public rooms the user is not already in.
 * This powers room discovery without exposing private rooms.
 */
async function listPublicRooms(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit

  const where = {
    isPrivate: false,
    members: { none: { userId } },
  }

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.room.count({ where }),
  ])

  return {
    rooms: rooms.map((r) => formatRoom(r)),
    total,
    page,
    pages: Math.ceil(total / limit),
  }
}

/**
 * getRoom — fetches a single room with its member list.
 * Throws 404 if not found, 403 if caller is not a member.
 */
async function getRoom(roomId, userId) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: { select: { id: true, username: true, avatarUrl: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { members: true } },
    },
  })

  if (!room) throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND')

  const isMember = room.members.some((m) => m.userId === userId)
  if (!isMember) throw new AppError('You are not a member of this room', 403, 'NOT_MEMBER')

  return {
    ...formatRoom(room),
    members: room.members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  }
}

/**
 * joinRoom — adds a user to a public room.
 * Throws 403 for private rooms, 409 if already a member.
 */
async function joinRoom(roomId, userId) {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room) throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND')
  if (room.isPrivate) throw new AppError('This room is private', 403, 'ROOM_PRIVATE')

  const existingMember = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  })

  if (existingMember) throw new AppError('You are already a member of this room', 409, 'ALREADY_MEMBER')

  await prisma.roomMember.create({
    data: { roomId, userId, role: 'MEMBER' },
  })

  logger.info({ roomId, userId }, 'User joined room')
}

/**
 * verifyMembership — used in socket handlers to check room access.
 * Returns the RoomMember or throws 403 AppError.
 */
async function verifyMembership(roomId, userId) {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  })

  if (!member) throw new AppError('You are not a member of this room', 403, 'NOT_MEMBER')
  return member
}

module.exports = { createRoom, listRooms, listPublicRooms, getRoom, joinRoom, verifyMembership, formatRoom }
