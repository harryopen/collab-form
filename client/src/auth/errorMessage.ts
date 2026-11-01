import { ApiError } from '../api/http.ts'

// Turns an auth error into text for the form. The server's validation message lists
// raw field paths, so show something friendlier for those.
export function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR') return 'Please check the details you entered.'
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

// Errors from the Google redirect flow arrive as /login?error=<code>.
const OAUTH_MESSAGES: Record<string, string> = {
  account_exists: 'An account with this email already exists. Log in with your password instead.',
  access_denied: 'Google sign-in was cancelled.',
  email_unverified: 'Your Google email address is not verified.',
  invalid_state: 'The sign-in attempt expired. Please try again.',
  google_not_configured: 'Google sign-in is not available.',
  google_failed: 'Google sign-in failed. Please try again.',
}

export function oauthErrorMessage(code: string | null): string | null {
  return code ? (OAUTH_MESSAGES[code] ?? OAUTH_MESSAGES.google_failed) : null
}
