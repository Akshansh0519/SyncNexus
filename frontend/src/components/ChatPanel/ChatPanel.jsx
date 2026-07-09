import { Hash } from 'lucide-react'
import Button from '../ui/Button.jsx'
import MessageComposer from './MessageComposer.jsx'
import MessageList from './MessageList.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import useRoomMessages from '../../hooks/useRoomMessages.js'
import useTyping from '../../hooks/useTyping.js'
import styles from './ChatPanel.module.css'

export default function ChatPanel({ room, roomId, loadingRoom, onToggleInfo, toggleIcon }) {
  const { messages, loading, hasMore, loadMore } = useRoomMessages(roomId)
  const { typingUserIds, startTyping, stopTyping } = useTyping(roomId)
  const userMap = Object.fromEntries((room?.members ?? []).map((member) => [member.userId, member.username]))

  if (!roomId) {
    return (
      <div className={styles.emptyState}>
        <Hash size={28} />
        <p>Create or select a room to start the realtime thread.</p>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <Hash size={18} />
          <div>
            <h1>{loadingRoom ? 'Loading room' : room?.name || 'Room'}</h1>
            <p>{room?.memberCount ?? room?.members?.length ?? 0} members</p>
          </div>
        </div>
        <Button variant="ghost" onClick={onToggleInfo} aria-label="Toggle info panel">{toggleIcon}</Button>
      </header>
      <MessageList messages={messages} loading={loading} hasMore={hasMore} loadMore={loadMore} />
      <TypingIndicator typingUserIds={typingUserIds} userMap={userMap} />
      <MessageComposer roomId={roomId} onStartTyping={startTyping} onStopTyping={stopTyping} />
    </div>
  )
}
