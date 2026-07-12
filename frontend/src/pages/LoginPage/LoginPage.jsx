import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import Input from '../../components/ui/Input.jsx'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/rooms')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <BrandPanel />
      <section className={styles.formSide}>
        {/* Background Watermark continuation for form side */}
        <div className={styles.formWatermark}>NEXUS</div>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTag}>// AUTHENTICATION_GATEWAY</span>
            <h1 className={styles.heading}>Welcome back</h1>
            <p className={styles.subheading}>Enter your credentials to access the distributed IDE</p>
          </div>
          <div className={styles.form}>
            <Input label="EMAIL ADDRESS" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="engineer@syncnexus.dev" required />
            <Input label="PASSWORD" name="password" type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="••••••••••••" required />
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.ctaButton} type="submit" disabled={loading}>
              <span>Sign In to Workspace</span>
              <ArrowRight size={18} />
            </button>
            <div className={styles.spinupNotice}>
              <span className={styles.spinupAsterisk}>*</span>
              <div>
                <strong>Free Tier Notice:</strong> Hosted on Render Free Tier. Initial sign-in may take <strong>~50–60 seconds</strong> if the server is waking up from sleep. Thank you for your patience!
              </div>
            </div>
          </div>
          <p className={styles.footer}>Don't have an account? <Link to="/register">Create Account</Link></p>
        </form>
      </section>
    </main>
  )
}

export function BrandPanel() {
  return (
    <section className={styles.brand}>
      {/* Giant Background Watermark Typography for Depth Clipping */}
      <div className={styles.watermark}>SYNCNEXUS</div>

      <div className={styles.brandContent}>
        {/* Top Header / Logo Badge */}
        <header className={styles.brandHeader}>
          <div className={styles.logoBadge}>
            <span className={styles.logoMark}>SN</span>
            <span className={styles.brandName}>SyncNexus<span className={styles.brandDot}>.</span></span>
          </div>
          <div className={styles.versionBadge}>
            <span className={styles.pulseDot} />
            v2.4.0-PROD
          </div>
        </header>

        {/* Hero Title */}
        <div className={styles.heroSection}>
          <div className={styles.categoryTag}>
            <span className={styles.categoryDot} />
            // DISTRIBUTED REAL-TIME IDE
          </div>
          <h1 className={styles.heroTitle}>
            Architect Systems with <span className={styles.highlightCyan}>AI Precision</span>.
          </h1>
          <p className={styles.heroDesc}>
            A high-performance real-time collaboration workspace featuring verified RAG document citations, distributed WebSocket rooms, and autonomous multi-agent coding workflows.
          </p>
        </div>

        {/* Cyberpunk Glass Spec Card */}
        <div className={styles.specCard}>
          <div className={styles.specHeader}>
            <span className={styles.statusBadge}>
              <span className={styles.statusDot} />
              SYSTEM ONLINE // PING: 12MS
            </span>
            <span className={styles.specLabel}>ENGINE STATUS</span>
          </div>
          
          <div className={styles.codeBlock}>
            <div className={styles.codeRow}>
              <span className={styles.codeKey}>"cluster"</span>: <span className={styles.codeStr}>"us-east-socket-pool"</span>,
            </div>
            <div className={styles.codeRow}>
              <span className={styles.codeKey}>"ai_engine"</span>: <span className={styles.codeStr}>"LangGraph • Groq Llama-3"</span>,
            </div>
            <div className={styles.codeRow}>
              <span className={styles.codeKey}>"vector_db"</span>: <span className={styles.codeStr}>"Chroma RAG • O(1) Search"</span>,
            </div>
            <div className={styles.codeRow}>
              <span className={styles.codeKey}>"throughput"</span>: <span className={styles.codeNum}>"10,000+ msg/sec"</span>
            </div>
          </div>

          <div className={styles.techPills}>
            <span className={styles.techPill}>WebSockets</span>
            <span className={styles.techPill}>ChromaDB</span>
            <span className={styles.techPill}>LangGraph</span>
            <span className={styles.techPill}>PyTorch</span>
            <span className={styles.techPill}>Distributed</span>
          </div>
        </div>

        {/* Live Demo Spin-Up Banner */}
        <div className={styles.brandSpinupBanner}>
          <div className={styles.bannerIcon}>⚡</div>
          <div className={styles.bannerText}>
            <span><strong>* Live Demo Notice:</strong> Hosted on Render Free Tier.</span>
            <small>If inactive for 15+ mins, initial connection takes <strong>~50 seconds</strong> while containers wake up. Subsequent interactions are instant (&lt;20ms).</small>
          </div>
        </div>
      </div>
    </section>
  )
}
