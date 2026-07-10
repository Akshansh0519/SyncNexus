import { X } from 'lucide-react'
import styles from './Modal.module.css'

export default function Modal({ title, children, onClose }) {
  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
