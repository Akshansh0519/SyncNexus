import styles from './TypingIndicator.module.css'

export default function TypingIndicator({ typingUserIds, userMap }) {
  if (!typingUserIds.length) return null

  const names = typingUserIds.map((id) => userMap[id] || 'Someone')
  const label = names.length === 1
    ? `${names[0]} is typing`
    : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : 'Several people are typing'

  return (
    <div className={styles.indicator}>
      <span>{label}</span>
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
