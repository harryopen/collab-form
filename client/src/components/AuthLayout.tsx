import type { ReactNode } from 'react'
import './auth.css'

interface AuthLayoutProps {
  title: string
  error: string | null
  footer: ReactNode
  children: ReactNode
}

export function AuthLayout({ title, error, footer, children }: AuthLayoutProps) {
  return (
    <main className="auth">
      <h1>{title}</h1>
      <div className="auth-card">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
      <p className="auth-footer">{footer}</p>
    </main>
  )
}
