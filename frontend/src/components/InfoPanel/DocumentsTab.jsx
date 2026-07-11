import { Download, File, FileImage, FileText, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getDownloadUrlRequest, listDocumentsRequest, uploadFileRequest } from '../../api/files.api.js'
import { useSocket } from '../../contexts/SocketContext.jsx'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import styles from './DocumentsTab.module.css'

function fileIcon(mimeType) {
  if (mimeType?.startsWith('image/')) return FileImage
  if (mimeType?.includes('pdf') || mimeType?.includes('text')) return FileText
  return File
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsTab({ roomId }) {
  const { socket } = useSocket()
  const inputRef = useRef(null)
  const [documents, setDocuments] = useState([])
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomId) return
    listDocumentsRequest(roomId).then(setDocuments).catch(() => setDocuments([]))
  }, [roomId])

  useEffect(() => {
    if (!socket || !roomId) return undefined

    const handleShared = ({ document }) => {
      if (document && document.roomId === roomId) {
        setDocuments((current) => [
          document,
          ...current.filter((item) => item.id !== document.id && item.filename !== document.filename && item.storageKey !== document.storageKey),
        ])
      }
    }
    const handleProgress = ({ documentId, percent }) => {
      setDocuments((current) => current.map((doc) => doc.id === documentId ? { ...doc, progressPercent: percent } : doc))
    }
    const handleFailed = ({ documentId, error }) => {
      setDocuments((current) => current.map((doc) => doc.id === documentId ? { ...doc, status: 'FAILED', error, progressPercent: null } : doc))
    }
    const handleReady = ({ document }) => {
      if (!document || document.roomId !== roomId) return
      setDocuments((current) => {
        const exists = current.some((doc) => doc.id === document.id || doc.filename === document.filename)
        if (exists) {
          return current.map((doc) => (doc.id === document.id || doc.filename === document.filename) ? { ...doc, ...document, progressPercent: null } : doc)
        }
        return [document, ...current]
      })
    }

    socket.on('file:shared', handleShared)
    socket.on('document:progress', handleProgress)
    socket.on('document:failed', handleFailed)
    socket.on('document:ready', handleReady)
    return () => {
      socket.off('file:shared', handleShared)
      socket.off('document:progress', handleProgress)
      socket.off('document:failed', handleFailed)
      socket.off('document:ready', handleReady)
    }
  }, [roomId, socket])

  async function handleFile(file) {
    if (!file || !roomId) return
    setError('')
    setProgress({ name: file.name, value: 0 })
    try {
      const document = await uploadFileRequest(roomId, file, (percent) => {
        setProgress({ name: file.name, value: percent })
      })
      setDocuments((current) => [
        document,
        ...current.filter((item) => item.id !== document.id && item.filename !== document.filename && item.storageKey !== document.storageKey),
      ])
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error
      const networkMsg = !err.response ? `Network error — cannot reach server (${err.message})` : null
      setError(serverMsg || networkMsg || `Upload failed (status ${err.response?.status}): ${err.message}`)
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDownload(doc) {
    const result = await getDownloadUrlRequest(roomId, doc.id)
    window.open(result.downloadUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className={styles.tab}>
      <Button variant="ghost" fullWidth onClick={() => inputRef.current?.click()}>
        <Upload size={15} /> Upload
      </Button>
      <input ref={inputRef} hidden type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={(event) => handleFile(event.target.files?.[0])} />
      {progress && (
        <div className={styles.progress}>
          <p>{progress.name}</p>
          <span><i style={{ width: `${progress.value}%` }} /></span>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.list}>
        {documents.length === 0 ? <p className={styles.empty}>No documents shared yet.</p> : documents.map((doc) => {
          const Icon = fileIcon(doc.mimeType)
          return (
            <article className={styles.doc} key={doc.id}>
              <Icon size={18} />
              <div className={styles.docMeta}>
                <p>{doc.filename}</p>
                <span>
                  {doc.status === 'PROCESSING' && doc.progressPercent !== undefined && doc.progressPercent !== null
                    ? `Processing... ${doc.progressPercent}%`
                    : doc.status === 'FAILED' && doc.error
                    ? <span className={styles.error}>{doc.error}</span>
                    : formatSize(doc.sizeBytes)}
                </span>
              </div>
              <Badge status={doc.status} />
              <button className={styles.download} type="button" onClick={() => handleDownload(doc)} aria-label={`Download ${doc.filename}`}>
                <Download size={15} />
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
