import { useCallback, useEffect, useRef, useState } from 'react'
import { getMessagesRequest } from '../api/rooms.api.js'
import { useSocket } from './useSocket.js'

export default function useRoomMessages(roomId) {
  const { socket } = useSocket()
  const [messages, setMessages] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    if (!roomId) {
      setMessages([])
      setNextCursor(null)
      setHasMore(false)
      return
    }

    let active = true
    setLoading(true)
    getMessagesRequest(roomId)
      .then((result) => {
        if (!active) return
        setMessages(result.messages ?? [])
        setNextCursor(result.nextCursor)
        setHasMore(Boolean(result.nextCursor))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [roomId])

  const loadMore = useCallback(async () => {
    if (!roomId || !nextCursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoading(true)
    try {
      const result = await getMessagesRequest(roomId, nextCursor)
      setMessages((current) => [...(result.messages ?? []), ...current])
      setNextCursor(result.nextCursor)
      setHasMore(Boolean(result.nextCursor))
    } finally {
      loadingMoreRef.current = false
      setLoading(false)
    }
  }, [nextCursor, roomId])

  useEffect(() => {
    if (!socket || !roomId) return undefined

    const handleNewMessage = ({ message }) => {
      if (message.roomId !== roomId) return
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
    }

    socket.on('message:new', handleNewMessage)
    return () => {
      socket.off('message:new', handleNewMessage)
    }
  }, [roomId, socket])

  return { messages, loading, hasMore, loadMore }
}
