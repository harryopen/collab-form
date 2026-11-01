import type { Peer } from '../editor/SocketIOProvider.ts'

const MAX_SHOWN = 5

// Coloured initials for everyone else who has the document open.
export function PresenceBar({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) return null
  const shown = peers.slice(0, MAX_SHOWN)
  const extra = peers.length - shown.length
  return (
    <ul className="presence" aria-label="People here now">
      {shown.map((peer) => (
        <li key={peer.id} className="presence-avatar" style={{ background: peer.color }} title={peer.name}>
          <span aria-hidden="true">{peer.name.trim().charAt(0).toUpperCase() || '?'}</span>
          <span className="visually-hidden">{peer.name}</span>
        </li>
      ))}
      {extra > 0 && <li className="presence-more">+{extra}</li>}
    </ul>
  )
}
