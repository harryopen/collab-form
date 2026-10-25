import type { Member, MemberRole } from '../api/members.ts'

interface MemberRowProps {
  member: Member
  busy: boolean
  onChangeRole: (role: MemberRole) => void
  onRemove: () => void
}

export function MemberRow({ member, busy, onChangeRole, onRemove }: MemberRowProps) {
  return (
    <li className="member-row">
      <div className="member-who">
        <span className="member-name">{member.name}</span>
        <span className="member-email">{member.email}</span>
      </div>
      <select
        aria-label={`Role for ${member.name}`}
        value={member.role}
        disabled={busy}
        onChange={(e) => onChangeRole(e.target.value as MemberRole)}
      >
        <option value="EDITOR">Editor</option>
        <option value="VIEWER">Viewer</option>
      </select>
      <button type="button" className="btn" disabled={busy} onClick={onRemove}>
        Remove
      </button>
    </li>
  )
}
