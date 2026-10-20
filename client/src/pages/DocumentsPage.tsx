import { useAuth } from '../auth/useAuth.ts'

// Placeholder: the document list arrives in task 4.1.
export function DocumentsPage() {
  const { user, logout } = useAuth()
  return (
    <main>
      <h1>Documents</h1>
      <p>Signed in as {user?.name}</p>
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </main>
  )
}
