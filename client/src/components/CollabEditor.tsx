import { useQueryClient } from '@tanstack/react-query'
import { EditorContent } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollabEditor } from '../editor/useCollabEditor.ts'
import { ConnectionStatus } from './ConnectionStatus.tsx'
import { EditorToolbar } from './EditorToolbar.tsx'

// Mount with key={documentId}: each document gets its own provider and Y.Doc.
export function CollabEditor({ documentId }: { documentId: string }) {
  const { editor, connection } = useCollabEditor(documentId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Access removed (or the document deleted): back to the list straight away.
  useEffect(() => {
    if (!connection.revoked) return
    void queryClient.invalidateQueries({ queryKey: ['documents'] })
    queryClient.removeQueries({ queryKey: ['document', documentId] })
    navigate('/', { replace: true })
  }, [connection.revoked, documentId, navigate, queryClient])

  // Role changed while open: refresh the badge and the owner-only controls.
  const lastRole = useRef(connection.role)
  useEffect(() => {
    if (lastRole.current && connection.role && lastRole.current !== connection.role) {
      void queryClient.invalidateQueries({ queryKey: ['document', documentId] })
    }
    if (connection.role) lastRole.current = connection.role
  }, [connection.role, documentId, queryClient])

  return (
    <section className="collab">
      <ConnectionStatus connection={connection} />
      {connection.error && <p role="alert" className="form-error">{connection.error}</p>}
      {editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-surface" />
    </section>
  )
}
