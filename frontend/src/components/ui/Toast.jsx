import { useEffect } from 'react'
import styles from './Toast.module.css'

export default function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return <div className={[styles.toast, styles[type]].join(' ')}>{message}</div>
}
