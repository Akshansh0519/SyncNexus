import styles from './Spinner.module.css'

export default function Spinner({ size = 22, fullPage = false }) {
  const ring = <span className={styles.spinner} style={{ width: size, height: size }} />

  if (!fullPage) return ring

  return <main className={styles.fullPage}>{ring}</main>
}
