import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth.ts'

// Wraps protected routes. Signed-out visitors go to /login?next=<where they were>,
// so share links survive logging in.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p>Loading…</p>
  if (!user) {
    const next = location.pathname + location.search + location.hash
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}
