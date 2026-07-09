import { AlertCircle, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSocket } from '../../contexts/SocketContext.jsx'
import CitationCard from './CitationCard.jsx'
import ReactMarkdown from 'react-markdown'
import styles from './AiTab.module.css'

export default function AiTab({ roomId }) {
  const { socket } = useSocket()
  const [question, setQuestion] = useState('')
  const [state, setState] = useState('idle')
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!socket || !roomId) return undefined

    const handleAnswer = ({ message }) => {
      if (!message || message.roomId !== roomId) return
      setAnswer({ content: message.content, citations: message.citations ?? [] })
      setState('answered')
    }
    const handleError = (payload) => {
      if (payload.roomId !== roomId) return
      setError(payload.error || 'AI assistant failed to answer')
      setState('error')
    }

    socket.on('ai:answer', handleAnswer)
    socket.on('ai:error', handleError)
    return () => {
      socket.off('ai:answer', handleAnswer)
      socket.off('ai:error', handleError)
    }
  }, [roomId, socket])

  function handleSubmit(event) {
    event.preventDefault()
    if (!question.trim() || !roomId) return
    setState('loading')
    setError('')
    setAnswer(null)
    socket.emit('ai:ask', { roomId, question: question.trim() })
  }

  return (
    <section className={styles.tab}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea className={styles.textarea} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your documents..." rows={4} />
        <button className={styles.askBtn} type="submit" disabled={!question.trim() || state === 'loading'}>
          <Sparkles size={15} /> Ask AI
        </button>
      </form>
      {state === 'loading' && (
        <div className={styles.loading}>
          <span className={styles.dots}><i /><i /><i /></span>
          Thinking...
        </div>
      )}
      {state === 'error' && (
        <p className={styles.error}><AlertCircle size={15} /> {error}</p>
      )}
      {state === 'answered' && answer && (
        <article className={styles.answer}>
          <span className={styles.aiBadge}>AI</span>
          <div className={styles.answerProse}>
            <ReactMarkdown>{answer.content || ''}</ReactMarkdown>
          </div>
          {answer.citations?.length > 0 && (
            <div className={styles.citations}>
              {answer.citations.map((citation, index) => <CitationCard citation={citation} key={`${citation.filename}-${index}`} />)}
            </div>
          )}
        </article>
      )}
    </section>
  )
}
