import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteDocument, renameDocument, type DocumentSummary } from '../api/documents.ts'
import { authErrorMessage } from '../auth/errorMessage.ts'

const updatedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function DocumentList({ documents, currentUserId }: { documents: DocumentSummary[]; currentUserId: string }) {
  return (
    <ul className="doc-list">
      {documents.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} currentUserId={currentUserId} />
      ))}
    </ul>
  )
}

function DocumentRow({ doc, currentUserId }: { doc: DocumentSummary; currentUserId: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['documents'] })

  const rename = useMutation({
    mutationFn: (next: string) => renameDocument(doc.id, next),
    onSuccess: () => {
      setEditing(false)
      void refresh()
    },
  })
  const remove = useMutation({ mutationFn: () => deleteDocument(doc.id), onSuccess: refresh })

  const canRename = doc.role !== 'viewer'
  const canDelete = doc.role === 'owner'
  const error = rename.error ?? remove.error

  function submitRename(e: React.FormEvent) {
    e.preventDefault()
    const next = title.trim()
    if (!next || next === doc.title) return setEditing(false)
    rename.mutate(next)
  }

  return (
    <li className="doc-row">
      <div className="doc-main">
        {editing ? (
          <form onSubmit={submitRename} className="doc-rename">
            <input
              aria-label="Document title"
              value={title}
              maxLength={200}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            />
            <button type="submit" className="btn" disabled={rename.isPending}>Save</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <Link to={`/d/${doc.id}`} className="doc-title">{doc.title}</Link>
        )}
        <span className="doc-meta">
          {doc.role === 'owner' ? 'You' : doc.owner.name} · Updated {updatedFormat.format(new Date(doc.updatedAt))}
          {doc.owner.id !== currentUserId && <span className={`badge badge-${doc.role}`}>{doc.role}</span>}
        </span>
        {error && <span role="alert" className="form-error">{authErrorMessage(error)}</span>}
      </div>
      {!editing && (
        <div className="doc-actions">
          {canRename && (
            <button type="button" className="btn" onClick={() => { setTitle(doc.title); setEditing(true) }}>Rename</button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={remove.isPending}
              onClick={() => window.confirm(`Delete “${doc.title}”? This cannot be undone.`) && remove.mutate()}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  )
}
