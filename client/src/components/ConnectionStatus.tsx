import type { ProviderState } from '../editor/SocketIOProvider.ts'

function describe({ status, role }: ProviderState): { text: string; tone: 'ok' | 'wait' | 'bad' } {
  switch (status) {
    case 'synced':
      return role === 'viewer' ? { text: 'Read-only', tone: 'ok' } : { text: 'Connected', tone: 'ok' }
    case 'connecting':
      return { text: 'Connecting…', tone: 'wait' }
    case 'syncing':
      return { text: 'Syncing…', tone: 'wait' }
    case 'offline':
      return { text: 'Offline — changes sync when you reconnect', tone: 'wait' }
    case 'error':
      return { text: 'Disconnected', tone: 'bad' }
  }
}

export function ConnectionStatus({ connection }: { connection: ProviderState }) {
  const { text, tone } = describe(connection)
  return (
    <p className={`connection connection-${tone}`} role="status">
      <span className="connection-dot" aria-hidden="true" />
      {text}
    </p>
  )
}
