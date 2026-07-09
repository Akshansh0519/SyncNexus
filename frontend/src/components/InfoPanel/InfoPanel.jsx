import { Bot, FileText, Users } from 'lucide-react'
import { useState } from 'react'
import usePresence from '../../hooks/usePresence.js'
import AiTab from './AiTab.jsx'
import DocumentsTab from './DocumentsTab.jsx'
import MembersTab from './MembersTab.jsx'
import styles from './InfoPanel.module.css'

const tabs = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'ai', label: 'AI', icon: Bot },
]

export default function InfoPanel({ room, roomId }) {
  const [activeTab, setActiveTab] = useState('members')
  const onlineUserIds = usePresence(roomId)

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.id} className={[styles.tab, activeTab === tab.id ? styles.active : ''].join(' ')} type="button" onClick={() => setActiveTab(tab.id)}>
              <Icon size={15} /> {tab.label}
            </button>
          )
        })}
      </div>
      <div className={styles.body}>
        <div style={{ display: activeTab === 'members' ? 'block' : 'none', height: '100%' }}>
          <MembersTab members={room?.members ?? []} onlineUserIds={onlineUserIds} />
        </div>
        <div style={{ display: activeTab === 'documents' ? 'block' : 'none', height: '100%' }}>
          <DocumentsTab roomId={roomId} />
        </div>
        <div style={{ display: activeTab === 'ai' ? 'block' : 'none', height: '100%' }}>
          <AiTab roomId={roomId} />
        </div>
      </div>
    </div>
  )
}
