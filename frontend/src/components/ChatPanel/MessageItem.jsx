import Avatar from '../ui/Avatar.jsx'
import CitationCard from '../InfoPanel/CitationCard.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import ReactMarkdown from 'react-markdown'
import styles from './MessageItem.module.css'

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function MessageItem({ message }) {
  const { user } = useAuth()
  const isMine = Boolean(
    user && (
      user.id === message.authorId ||
      (user.username && message.authorUsername && user.username.toLowerCase().trim() === message.authorUsername.toLowerCase().trim())
    )
  )

  if (message.type === 'SYSTEM') {
    return <div className={styles.systemMessage}>{message.content}</div>
  }

  if (message.type === 'AI') {
    return (
      <article className={styles.aiMessage}>
        <div className={styles.aiCard}>
          <header className={styles.aiHeader}>
            <span className={styles.aiBadge}>AI</span>
            <span className={styles.aiLabel}>SyncNexus AI</span>
          </header>
          <div className={styles.aiProse}>
            <ReactMarkdown>{message.content || ''}</ReactMarkdown>
          </div>
          {message.citations?.length > 0 && (
            <div className={styles.citations}>
              {message.citations.map((citation, index) => <CitationCard citation={citation} key={`${citation.filename}-${index}`} />)}
            </div>
          )}
        </div>
      </article>
    )
  }

  return (
    <article className={[styles.userMessage, isMine ? styles.myMessage : styles.theirMessage].join(' ')}>
      <Avatar userId={message.authorId} username={message.authorUsername || 'Unknown'} size={28} />
      <div className={styles.bubble}>
        <div className={styles.meta}>
          <span className={styles.username}>{isMine ? `${message.authorUsername || 'You'} (You)` : (message.authorUsername || 'Unknown')}</span>
          <time className={styles.timestamp}>{formatTime(message.createdAt)}</time>
        </div>
        <p className={styles.content}>{message.content}</p>
      </div>
    </article>
  )
}
