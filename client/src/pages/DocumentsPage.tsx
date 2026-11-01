import { useQuery } from '@tanstack/react-query'
import { listDocuments } from '../api/documents.ts'
import { authErrorMessage } from '../auth/errorMessage.ts'
import { useAuth } from '../auth/useAuth.ts'
import { DocumentList } from '../components/DocumentList.tsx'
import { NewDocumentButton } from '../components/NewDocumentButton.tsx'
import '../components/documents.css'

export function DocumentsPage() {
  const { user, logout } = useAuth()
  const documents = useQuery({ queryKey: ['documents'], queryFn: listDocuments })

  return (
    <main className="docs">
      <header className="docs-header">
        <h1>Documents</h1>
        <div className="docs-user">
          <span>{user?.name}</span>
          <button type="button" className="btn" onClick={() => void logout()}>Log out</button>
        </div>
      </header>
      <NewDocumentButton />
      {documents.isPending && <p>Loading documents…</p>}
      {documents.isError && (
        <p role="alert" className="form-error">
          {authErrorMessage(documents.error)}{' '}
          <button type="button" className="btn" onClick={() => void documents.refetch()}>Retry</button>
        </p>
      )}
      {documents.data?.length === 0 && <p className="docs-empty">No documents yet. Create your first one.</p>}
      {documents.data && documents.data.length > 0 && user && (
        <DocumentList documents={documents.data} currentUserId={user.id} />
      )}
    </main>
  )
}
