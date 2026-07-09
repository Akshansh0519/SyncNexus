import { Hash } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import styles from './RoomListItem.module.css'

export default function RoomListItem({ room, active }) {
  return (
    <NavLink className={[styles.item, active ? styles.active : ''].join(' ')} to={`/rooms/${room.id}`}>
      <Hash className={styles.hash} size={16} />
      <span className={styles.name}>{room.name}</span>
      <span className={styles.count}>{room.memberCount}</span>
    </NavLink>
  )
}
