import { useEditor } from '@tiptap/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createExtensions } from './extensions.ts'
import { SocketIOProvider } from './SocketIOProvider.ts'

// One provider per mounted editor; the caller keys the component on the document id.
export function useCollabEditor(documentId: string) {
  const [provider] = useState(() => new SocketIOProvider(documentId))
  const connection = useSyncExternalStore(provider.subscribe, provider.getState)

  useEffect(() => {
    provider.connect()
    return () => provider.disconnect()
  }, [provider])

  // The editor never sets initial content; it stays read-only until the first sync
  // (so a brand-new document cannot be seeded twice) and for viewers.
  const editable = connection.status === 'synced' && connection.role !== 'viewer'

  const editor = useEditor({
    extensions: createExtensions(provider.doc),
    editable: false,
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  return { editor, connection }
}
