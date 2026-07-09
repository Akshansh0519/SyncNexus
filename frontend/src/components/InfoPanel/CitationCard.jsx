import styles from './CitationCard.module.css'

export default function CitationCard({ citation }) {
  const snippet = citation.snippet || citation.text || ''
  return (
    <article className={styles.card}>
      <p className={styles.filename}>{citation.filename || citation.documentName || 'Document'}</p>
      <p className={styles.meta}>{citation.page ? `Page ${citation.page}` : 'Retrieved source'}</p>
      <p className={styles.snippet}>{snippet.slice(0, 80)}</p>
    </article>
  )
}
