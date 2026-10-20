import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout.tsx'
import { TextField } from '../components/TextField.tsx'
import { authErrorMessage } from '../auth/errorMessage.ts'
import { safeNextPath } from '../auth/safeNext.ts'
import { useAuth } from '../auth/useAuth.ts'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nextParam = params.get('next')
  const next = safeNextPath(nextParam)

  if (loading) return <p>Loading…</p>
  // Already signed in (or just logged in): go where the visitor was heading.
  if (user) return <Navigate to={next} replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await login({ email: String(form.get('email')), password: String(form.get('password')) })
    } catch (err) {
      setError(authErrorMessage(err))
      setSubmitting(false)
    }
  }

  const signupLink = nextParam ? `/signup?next=${encodeURIComponent(next)}` : '/signup'

  return (
    <AuthLayout
      title="Log in"
      error={error}
      footer={
        <>
          No account? <Link to={signupLink}>Sign up</Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <TextField label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  )
}
