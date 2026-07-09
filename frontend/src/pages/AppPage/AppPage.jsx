import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { getRoomRequest, listRoomsRequest } from '../../api/rooms.api.js'
import ChatPanel from '../../components/ChatPanel/ChatPanel.jsx'
import InfoPanel from '../../components/InfoPanel/InfoPanel.jsx'
import Sidebar from '../../components/Sidebar/Sidebar.jsx'
import { useSocket } from '../../contexts/SocketContext.jsx'
import styles from './AppPage.module.css'

export default function AppPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const [rooms, setRooms] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [infoCollapsed, setInfoCollapsed] = useState(false)
  const [loadingRoom, setLoadingRoom] = useState(false)

  useEffect(() => {
    let active = true
    listRoomsRequest().then((roomList) => {
      if (!active) return
      setRooms(roomList)
      if (!roomId && roomList.length > 0) {
        navigate(`/rooms/${roomList[0].id}`, { replace: true })
      }
    }).catch(() => {
      if (active) setRooms([])
    })
    return () => {
      active = false
    }
  }, [navigate, roomId])

  useEffect(() => {
    if (!roomId) {
      setCurrentRoom(null)
      return
    }

    let active = true
    setLoadingRoom(true)
    getRoomRequest(roomId)
      .then((room) => {
        if (active) setCurrentRoom(room)
      })
      .finally(() => {
        if (active) setLoadingRoom(false)
      })

    return () => {
      active = false
    }
  }, [roomId])

  useEffect(() => {
    if (!socket || !isConnected || !roomId) return undefined

    socket.emit('room:join', { roomId })
    return () => {
      socket.emit('room:leave', { roomId })
    }
  }, [isConnected, roomId, socket])

  function handleRoomCreated(room) {
    setRooms((existing) => [room, ...existing.filter((item) => item.id !== room.id)])
    navigate(`/rooms/${room.id}`)
  }

  return (
    <main className={[styles.layout, infoCollapsed ? styles.infoCollapsed : ''].join(' ')}>
      <aside className={styles.sidebar}>
        <Sidebar rooms={rooms} activeRoomId={roomId} onRoomCreated={handleRoomCreated} connected={isConnected} />
      </aside>
      <section className={styles.chat}>
        <ChatPanel
          room={currentRoom}
          roomId={roomId}
          loadingRoom={loadingRoom}
          onToggleInfo={() => setInfoCollapsed((value) => !value)}
          toggleIcon={infoCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        />
      </section>
      <aside className={styles.info}>
        <InfoPanel room={currentRoom} roomId={roomId} />
      </aside>
    </main>
  )
}
