import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout.tsx'
import { TextField } from '../components/TextField.tsx'
import { authErrorMessage } from '../auth/errorMessage.ts'
import { safeNextPath } from '../auth/safeNext.ts'
import { useAuth } from '../auth/useAuth.ts'

export function SignupPage() {
  const { user, loading, signup } = useAuth()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nextParam = params.get('next')
  const next = safeNextPath(nextParam)

  if (loading) return <p>Loading…</p>
  if (user) return <Navigate to={next} replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await signup({
        name: String(form.get('name')),
        email: String(form.get('email')),
        password: String(form.get('password')),
      })
    } catch (err) {
      setError(authErrorMessage(err))
      setSubmitting(false)
    }
  }

  const loginLink = nextParam ? `/login?next=${encodeURIComponent(next)}` : '/login'

  return (
    <AuthLayout
      title="Create your account"
      error={error}
      footer={
        <>
          Already have an account? <Link to={loginLink}>Log in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <TextField label="Name" name="name" autoComplete="name" required maxLength={100} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </AuthLayout>
  )
}
