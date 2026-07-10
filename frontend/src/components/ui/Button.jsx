import styles from './Button.module.css'

export default function Button({ variant = 'primary', fullWidth = false, className = '', children, ...props }) {
  const classes = [styles.button, styles[variant], fullWidth ? styles.fullWidth : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} type="button" {...props}>
      {children}
    </button>
  )
}
