import { EditorContent } from '@tiptap/react'
import { useCollabEditor } from '../editor/useCollabEditor.ts'
import { ConnectionStatus } from './ConnectionStatus.tsx'
import { EditorToolbar } from './EditorToolbar.tsx'

// Mount with key={documentId}: each document gets its own provider and Y.Doc.
export function CollabEditor({ documentId }: { documentId: string }) {
  const { editor, connection } = useCollabEditor(documentId)

  return (
    <section className="collab">
      <ConnectionStatus connection={connection} />
      {connection.error && <p role="alert" className="form-error">{connection.error}</p>}
      {editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-surface" />
    </section>
  )
}
