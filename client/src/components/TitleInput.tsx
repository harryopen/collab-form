import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { renameDocument, type DocumentSummary } from '../api/documents.ts'
import { authErrorMessage } from '../auth/errorMessage.ts'

// Editable document title. Saves on blur or Enter; Escape reverts. Read-only for viewers.
export function TitleInput({ doc }: { doc: DocumentSummary }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(doc.title)

  const rename = useMutation({
    mutationFn: (title: string) => renameDocument(doc.id, title),
    onSuccess: (updated) => {
      queryClient.setQueryData(['document', doc.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: () => setValue(doc.title),
  })

  if (doc.role === 'viewer') return <h1 className="editor-title">{doc.title}</h1>

  function save() {
    const next = value.trim()
    if (!next || next === doc.title) return setValue(doc.title)
    rename.mutate(next)
  }

  return (
    <div className="editor-title-wrap">
      <input
        className="editor-title"
        aria-label="Document title"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValue(doc.title)
            e.currentTarget.blur()
          }
        }}
      />
      {rename.isError && <span role="alert" className="form-error">{authErrorMessage(rename.error)}</span>}
    </div>
  )
}
