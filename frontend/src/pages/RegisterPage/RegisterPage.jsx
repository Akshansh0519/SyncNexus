import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import Input from '../../components/ui/Input.jsx'
import { BrandPanel } from '../LoginPage/LoginPage.jsx'
import styles from '../LoginPage/LoginPage.module.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form.email, form.username, form.password)
      navigate('/rooms')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <BrandPanel />
      <section className={styles.formSide}>
        <div className={styles.formWatermark}>NEXUS</div>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTag}>// NEW_ENGINEER_ONBOARDING</span>
            <h1 className={styles.heading}>Initialize Account</h1>
            <p className={styles.subheading}>Join the real-time AI pair programming ecosystem</p>
          </div>
          <div className={styles.form}>
            <Input label="EMAIL ADDRESS" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="engineer@syncnexus.dev" required />
            <Input label="USERNAME" name="username" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="alex_dev" required />
            <Input label="PASSWORD" name="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="••••••••••••" required />
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.ctaButton} type="submit" disabled={loading}>
              <span>Initialize Workspace</span>
              <ArrowRight size={18} />
            </button>
            <div className={styles.spinupNotice}>
              <span className={styles.spinupAsterisk}>*</span>
              <div>
                <strong>Free Tier Notice:</strong> Hosted on Render Free Tier. Account initialization may take <strong>~50–60 seconds</strong> while the backend container wakes up from sleep. Thank you!
              </div>
            </div>
          </div>
          <p className={styles.footer}>Already initialized? <Link to="/login">Sign In</Link></p>
        </form>
      </section>
    </main>
  )
}
