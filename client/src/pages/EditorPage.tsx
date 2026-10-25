import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { fetchDocument } from '../api/documents.ts'
import { ApiError } from '../api/http.ts'
import { authErrorMessage } from '../auth/errorMessage.ts'
import { CollabEditor } from '../components/CollabEditor.tsx'
import { TitleInput } from '../components/TitleInput.tsx'
import '../components/editor.css'
import { NotFoundPage } from './NotFoundPage.tsx'

export function EditorPage() {
  const { id = '' } = useParams()
  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => fetchDocument(id),
    // 404/403 are final answers, not worth retrying.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 2,
  })

  if (doc.isPending) return <main className="editor"><p>Loading document…</p></main>
  if (doc.error instanceof ApiError && (doc.error.status === 404 || doc.error.status === 403)) return <NotFoundPage />
  if (doc.isError) {
    return (
      <main className="editor">
        <p role="alert" className="form-error">{authErrorMessage(doc.error)}</p>
        <button type="button" className="btn" onClick={() => void doc.refetch()}>Retry</button>
      </main>
    )
  }

  return (
    <main className="editor">
      <header className="editor-header">
        <Link to="/">← Documents</Link>
        <span className={`badge badge-${doc.data.role}`}>{doc.data.role}</span>
      </header>
      <TitleInput key={doc.data.title} doc={doc.data} />
      <CollabEditor key={doc.data.id} documentId={doc.data.id} />
    </main>
  )
}
