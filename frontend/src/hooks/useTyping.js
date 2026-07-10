import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.js'
import { useSocket } from './useSocket.js'

export default function useTyping(roomId) {
  const { user } = useAuth()
  const { socket } = useSocket()
  const [typingUserIds, setTypingUserIds] = useState([])

  useEffect(() => {
    setTypingUserIds([])
    if (!socket || !roomId) return undefined

    const handleTyping = (payload) => {
      if (payload.roomId !== roomId) return
      setTypingUserIds((payload.typingUserIds ?? []).filter((userId) => userId !== user?.id))
    }

    socket.on('typing:update', handleTyping)
    return () => {
      socket.off('typing:update', handleTyping)
    }
  }, [roomId, socket, user?.id])

  const startTyping = useCallback(() => {
    if (roomId) socket.emit('typing:start', { roomId })
  }, [roomId, socket])

  const stopTyping = useCallback(() => {
    if (roomId) socket.emit('typing:stop', { roomId })
  }, [roomId, socket])

  return { typingUserIds, startTyping, stopTyping }
}
