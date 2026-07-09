import { Link } from 'react-router-dom'
import { LogOut, Moon, Plus, Search, Sun } from 'lucide-react'
import { useState } from 'react'
import { createRoomRequest, joinRoomRequest, listPublicRoomsRequest } from '../../api/rooms.api.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useTheme } from '../../contexts/ThemeContext.jsx'
import Avatar from '../ui/Avatar.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Modal from '../ui/Modal.jsx'
import RoomListItem from './RoomListItem.jsx'
import styles from './Sidebar.module.css'

export default function Sidebar({ rooms, activeRoomId, onRoomCreated, connected }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [showModal, setShowModal] = useState(false)
  const [showPublicRooms, setShowPublicRooms] = useState(false)
  const [publicRooms, setPublicRooms] = useState([])
  const [roomName, setRoomName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreateRoom(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const room = await createRoomRequest(roomName.trim(), isPrivate)
      setRoomName('')
      setIsPrivate(false)
      setShowModal(false)
      onRoomCreated(room)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to create room')
    } finally {
      setSaving(false)
    }
  }

  async function openPublicRooms() {
    setError('')
    setShowPublicRooms(true)
    try {
      setPublicRooms(await listPublicRoomsRequest())
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load public rooms')
    }
  }

  async function handleJoinRoom(room) {
    setError('')
    setSaving(true)
    try {
      await joinRoomRequest(room.id)
      setShowPublicRooms(false)
      setPublicRooms((current) => current.filter((item) => item.id !== room.id))
      onRoomCreated(room)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to join room')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.sidebar}>
      <header className={styles.header}>
        <Link className={styles.logo} to="/rooms">Sync<span>Nexus</span><span className={styles.logoDot}>.</span></Link>
        <p className={[styles.status, connected ? styles.statusConnected : styles.statusConnecting].join(' ')}>
          <span className={styles.statusDot} />
          {connected ? 'Live · WebSocket' : 'Reconnecting...'}
        </p>
      </header>
      <div className={styles.newRoomBtn}>
        <Button variant="ghost" fullWidth onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Room
        </Button>
        <Button variant="ghost" fullWidth onClick={openPublicRooms}>
          <Search size={16} /> Browse Public
        </Button>
      </div>
      <nav className={styles.roomList} aria-label="Rooms">
        {rooms.length === 0 ? <p className={styles.empty}>Create a room to start chatting.</p> : rooms.map((room) => (
          <RoomListItem key={room.id} room={room} active={room.id === activeRoomId} />
        ))}
      </nav>
      <footer className={styles.footer}>
        <Avatar userId={user?.id} username={user?.username} />
        <div className={styles.userMeta}>
          <p className={styles.userName}>{user?.username}</p>
          <p className={styles.userEmail}>{user?.email}</p>
        </div>
        <span className={styles.onlineDot} />
        <button
          className={styles.themeToggle}
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className={styles.logout} type="button" onClick={logout} aria-label="Log out" title="Log out">
          <LogOut size={16} />
        </button>
      </footer>
      {showModal && (
        <Modal title="Create room" onClose={() => setShowModal(false)}>
          <form className={styles.modalForm} onSubmit={handleCreateRoom}>
            <Input label="Room name" value={roomName} onChange={(event) => setRoomName(event.target.value)} required autoFocus />
            <label className={styles.checkbox}>
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
              Private room
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <Button type="submit" disabled={!roomName.trim() || saving}>Create</Button>
          </form>
        </Modal>
      )}
      {showPublicRooms && (
        <Modal title="Public rooms" onClose={() => setShowPublicRooms(false)}>
          <div className={styles.publicRooms}>
            {error && <p className={styles.error}>{error}</p>}
            {publicRooms.length === 0 ? (
              <p className={styles.emptyPublic}>No public rooms are available to join.</p>
            ) : publicRooms.map((room) => (
              <article className={styles.publicRoom} key={room.id}>
                <div>
                  <p>{room.name}</p>
                  <span>{room.memberCount} members</span>
                </div>
                <Button type="button" onClick={() => handleJoinRoom(room)} disabled={saving}>Join</Button>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
