import { useEffect, useRef, useState } from 'react'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { useSocket } from '../../contexts/SocketContext.jsx'
import styles from './MessageComposer.module.css'

export default function MessageComposer({ roomId, onStartTyping, onStopTyping }) {
  const { socket } = useSocket()
  const [content, setContent] = useState('')
  const textareaRef = useRef(null)
  const typingTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(typingTimerRef.current), [])

  function resizeTextarea(target) {
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 144)}px`
  }

  function handleChange(event) {
    setContent(event.target.value)
    resizeTextarea(event.target)
    onStartTyping()
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(onStopTyping, 2000)
  }

  function sendMessage() {
    const trimmed = content.trim()
    if (!trimmed || !roomId) return
    socket.emit('message:send', { roomId, content: trimmed })
    setContent('')
    onStopTyping()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); sendMessage() }}>
      <div className={styles.inner}>
        <button className={styles.iconBtn} type="button" aria-label="Attach file">
          <Paperclip size={18} />
        </button>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          rows={1}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message this room..."
        />
        <button className={styles.sendBtn} type="submit" disabled={!content.trim()} aria-label="Send message">
          <SendHorizontal size={18} />
        </button>
      </div>
    </form>
  )
}
