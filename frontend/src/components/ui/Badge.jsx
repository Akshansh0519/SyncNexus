import styles from './Badge.module.css'

export default function Badge({ status = 'PENDING' }) {
  const normalized = status.toUpperCase()
  return <span className={[styles.badge, styles[normalized.toLowerCase()]].filter(Boolean).join(' ')}>{normalized}</span>
}
