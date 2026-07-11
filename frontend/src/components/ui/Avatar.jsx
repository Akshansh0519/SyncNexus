import styles from './Avatar.module.css'

const avatarThemes = [
  { bg: 'linear-gradient(135deg, #00d4ff 0%, #0088ff 100%)', text: '#000000', border: 'rgba(0, 212, 255, 0.5)' }, // 0: Electric Cyan
  { bg: 'linear-gradient(135deg, #ff6b35 0%, #ff9f43 100%)', text: '#000000', border: 'rgba(255, 107, 53, 0.5)' }, // 1: Coral Orange
  { bg: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', text: '#ffffff', border: 'rgba(168, 85, 247, 0.5)' }, // 2: Neon Purple
  { bg: 'linear-gradient(135deg, #00e5a0 0%, #059669 100%)', text: '#000000', border: 'rgba(0, 229, 160, 0.5)' }, // 3: Emerald Green
  { bg: 'linear-gradient(135deg, #ff4d6a 0%, #e11d48 100%)', text: '#ffffff', border: 'rgba(255, 77, 106, 0.5)' }, // 4: Rose Pink
  { bg: 'linear-gradient(135deg, #ffcc02 0%, #d97706 100%)', text: '#000000', border: 'rgba(255, 204, 2, 0.5)' }, // 5: Golden Amber
  { bg: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', text: '#000000', border: 'rgba(56, 189, 248, 0.5)' }, // 6: Sky Blue
  { bg: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', text: '#ffffff', border: 'rgba(236, 72, 153, 0.5)' }, // 7: Fuchsia Pink
  { bg: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)', text: '#000000', border: 'rgba(45, 212, 191, 0.5)' }, // 8: Teal Green
  { bg: 'linear-gradient(135deg, #a3e635 0%, #65a30d 100%)', text: '#000000', border: 'rgba(163, 230, 53, 0.5)' }, // 9: Lime Green
  { bg: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)', text: '#000000', border: 'rgba(251, 146, 60, 0.5)' }, // 10: Vivid Orange
  { bg: 'linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)', text: '#ffffff', border: 'rgba(129, 140, 248, 0.5)' }, // 11: Indigo Violet
  { bg: 'linear-gradient(135deg, #f43f5e 0%, #9f1239 100%)', text: '#ffffff', border: 'rgba(244, 63, 94, 0.5)' }, // 12: Crimson Red
  { bg: 'linear-gradient(135deg, #67e8f9 0%, #0891b2 100%)', text: '#000000', border: 'rgba(103, 232, 249, 0.5)' }, // 13: Cyan Mint
  { bg: 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)', text: '#000000', border: 'rgba(250, 204, 21, 0.5)' }, // 14: Gold Yellow
  { bg: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)', text: '#ffffff', border: 'rgba(192, 132, 252, 0.5)' }, // 15: Deep Lavender
]

function hash(value = '') {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return Math.abs(h >>> 0)
}

function getInitials(username = '?') {
  const clean = String(username || '?').trim()
  if (!clean || clean === '?') return '?'

  const spaced = clean.replace(/([a-z])([A-Z0-9])/g, '$1 $2')
  const parts = spaced.split(/\s+|_|-|\./).filter(Boolean)

  if (parts.length >= 2) {
    const first = parts[0][0]
    const last = parts[parts.length - 1]
    if (/^[0-9]+$/.test(last)) {
      return (first + last).toUpperCase()
    }
    return (first + parts[1][0]).toUpperCase()
  }

  return clean.slice(0, 2).toUpperCase()
}

export default function Avatar({ userId = '', username = '?', size = 32 }) {
  const initials = getInitials(username)
  const identifier = `${username || ''}:${userId || ''}`
  const theme = avatarThemes[hash(identifier) % avatarThemes.length]

  return (
    <div
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: theme.bg,
        color: theme.text,
        boxShadow: `inset 0 0 0 1.5px ${theme.border}, 0 2px 8px rgba(0, 0, 0, 0.25)`,
      }}
      title={username}
    >
      {initials}
    </div>
  )
}
