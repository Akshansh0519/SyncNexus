import { useEffect, useState } from 'react'
import { useSocket } from './useSocket.js'

export default function usePresence(roomId) {
  const { socket } = useSocket()
  const [onlineUserIds, setOnlineUserIds] = useState([])

  useEffect(() => {
    setOnlineUserIds([])
    if (!socket || !roomId) return undefined

    const handlePresence = (payload) => {
      if (payload.roomId === roomId) setOnlineUserIds(payload.onlineUserIds ?? [])
    }

    socket.on('presence:update', handlePresence)
    return () => {
      socket.off('presence:update', handlePresence)
    }
  }, [roomId, socket])

  return onlineUserIds
}
