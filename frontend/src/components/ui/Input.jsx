import styles from './Input.module.css'

export default function Input({ label, error, id, className = '', ...props }) {
  const inputId = id || props.name

  return (
    <label className={styles.field} htmlFor={inputId}>
      {label && <span className={styles.label}>{label}</span>}
      <input id={inputId} className={[styles.input, error ? styles.errorInput : '', className].filter(Boolean).join(' ')} {...props} />
      {error && <span className={styles.error}>{error}</span>}
    </label>
  )
}
