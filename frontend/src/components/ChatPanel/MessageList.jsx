import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem.jsx'
import styles from './MessageList.module.css'

export default function MessageList({ messages, loading, hasMore, loadMore }) {
  const listRef = useRef(null)
  const sentinelRef = useRef(null)
  const shouldStickRef = useRef(true)

  useEffect(() => {
    const root = listRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return undefined

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore) loadMore()
    }, { root, threshold: 0.8 })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  useEffect(() => {
    const root = listRef.current
    if (!root || !shouldStickRef.current) return
    root.scrollTop = root.scrollHeight
  }, [messages.length])

  function handleScroll() {
    const root = listRef.current
    if (!root) return
    shouldStickRef.current = root.scrollHeight - root.scrollTop - root.clientHeight < 140
  }

  return (
    <div className={styles.list} ref={listRef} onScroll={handleScroll}>
      <div ref={sentinelRef} className={styles.sentinel} />
      {loading && <Skeleton />}
      {messages.length === 0 && !loading ? <p className={styles.empty}>No messages yet. Say the first useful thing.</p> : messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  )
}

function Skeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
      <span className={styles.skeletonShort} />
    </div>
  )
}
