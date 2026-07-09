import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext.jsx'

const SocketContext = createContext(null)
const socket = io(import.meta.env.VITE_SOCKET_URL, {
  autoConnect: false,
  auth: { token: null },
  path: '/ws/socket.io',
  transports: ['websocket'],
})

export function SocketProvider({ children }) {
  const { accessToken } = useAuth()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [])

  useEffect(() => {
    if (!accessToken) {
      socket.disconnect()
      return
    }

    socket.auth = { token: accessToken }
    if (socket.connected) {
      socket.disconnect().connect()
    } else {
      socket.connect()
    }
  }, [accessToken])

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) throw new Error('useSocket must be used inside SocketProvider')
  return context
}
