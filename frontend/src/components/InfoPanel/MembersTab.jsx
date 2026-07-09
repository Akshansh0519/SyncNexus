import Avatar from '../ui/Avatar.jsx'
import styles from './MembersTab.module.css'

export default function MembersTab({ members, onlineUserIds }) {
  const onlineSet = new Set(onlineUserIds)
  const online = members.filter((member) => onlineSet.has(member.userId))
  const offline = members.filter((member) => !onlineSet.has(member.userId))

  return (
    <div className={styles.sections}>
      <MemberSection title="Online" count={online.length} members={online} online />
      <MemberSection title="Offline" count={offline.length} members={offline} />
    </div>
  )
}

function MemberSection({ title, count, members, online = false }) {
  return (
    <section className={styles.section}>
      <h2>{title}<span>{count}</span></h2>
      <div className={styles.list}>
        {members.length === 0 ? <p className={styles.empty}>No members here.</p> : members.map((member) => (
          <div className={styles.member} key={member.userId}>
            <Avatar userId={member.userId} username={member.username} size={30} />
            <div className={styles.meta}>
              <p>{member.username}</p>
              <span>{member.role}</span>
            </div>
            <i className={online ? styles.onlineDot : styles.offlineDot} />
          </div>
        ))}
      </div>
    </section>
  )
}
