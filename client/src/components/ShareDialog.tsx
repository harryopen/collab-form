import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { setShareMode, type DocumentSummary } from '../api/documents.ts'
import { ApiError } from '../api/http.ts'
import { addMember, listMembers, removeMember, updateMemberRole, type MemberRole } from '../api/members.ts'
import { authErrorMessage } from '../auth/errorMessage.ts'
import { MemberRow } from './MemberRow.tsx'
import './share.css'

function inviteErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'USER_NOT_FOUND') return 'No account with that email. They need to sign up first.'
    if (err.code === 'ALREADY_MEMBER') return 'That person already has access. Change their role below.'
    if (err.code === 'VALIDATION_ERROR' && err.status === 400) return err.message.includes('owner') ? err.message : 'Enter a valid email address.'
  }
  return authErrorMessage(err)
}

interface ShareDialogProps {
  doc: DocumentSummary
  onClose: () => void
}

// Owner-only. Rendered while open; the native <dialog> provides focus trapping and Escape.
export function ShareDialog({ doc, onClose }: ShareDialogProps) {
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('EDITOR')

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const membersKey = ['members', doc.id]
  const members = useQuery({ queryKey: membersKey, queryFn: () => listMembers(doc.id) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: membersKey })

  const invite = useMutation({
    mutationFn: () => addMember(doc.id, email.trim(), role),
    onSuccess: () => {
      setEmail('')
      return refresh()
    },
  })
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: MemberRole }) => updateMemberRole(doc.id, v.userId, v.role),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(doc.id, userId),
    onSettled: refresh,
  })
  const shareMode = useMutation({
    mutationFn: (mode: DocumentSummary['shareMode']) => setShareMode(doc.id, mode),
    onSuccess: (updated) => {
      queryClient.setQueryData(['document', doc.id], updated)
      return queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (email.trim()) invite.mutate()
  }

  const rowError = changeRole.error ?? remove.error

  return (
    <dialog ref={dialogRef} className="share" aria-labelledby="share-title" onClose={onClose}>
      <header className="share-header">
        <h2 id="share-title">Share “{doc.title}”</h2>
        <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
          Done
        </button>
      </header>

      <form className="share-invite" onSubmit={submit}>
        <input
          type="email"
          aria-label="Email address"
          placeholder="Add people by email"
          value={email}
          maxLength={254}
          required
          onChange={(e) => {
            setEmail(e.target.value)
            invite.reset()
          }}
        />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          <option value="EDITOR">Editor</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={invite.isPending}>
          {invite.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>
      {invite.isError && <p role="alert" className="form-error">{inviteErrorMessage(invite.error)}</p>}

      <h3>People with access</h3>
      {members.isPending && <p>Loading…</p>}
      {members.isError && (
        <p role="alert" className="form-error">
          {authErrorMessage(members.error)}{' '}
          <button type="button" className="btn" onClick={() => void members.refetch()}>Retry</button>
        </p>
      )}
      {members.data?.length === 0 && <p className="share-empty">Only you can open this document.</p>}
      <ul className="member-list">
        {members.data?.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            busy={changeRole.isPending || remove.isPending}
            onChangeRole={(next) => changeRole.mutate({ userId: member.userId, role: next })}
            onRemove={() => remove.mutate(member.userId)}
          />
        ))}
      </ul>
      {rowError && <p role="alert" className="form-error">{authErrorMessage(rowError)}</p>}

      <h3>Link access</h3>
      <div className="share-link">
        <select
          aria-label="Link access"
          value={doc.shareMode}
          disabled={shareMode.isPending}
          onChange={(e) => shareMode.mutate(e.target.value as DocumentSummary['shareMode'])}
        >
          <option value="OFF">Only people added above</option>
          <option value="VIEWER">Anyone signed in can view</option>
          <option value="EDITOR">Anyone signed in can edit</option>
        </select>
        <p className="share-hint">Link access takes effect once share links are switched on (a later task).</p>
      </div>
      {shareMode.isError && <p role="alert" className="form-error">{authErrorMessage(shareMode.error)}</p>}
    </dialog>
  )
}
