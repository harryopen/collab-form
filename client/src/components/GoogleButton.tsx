// A plain link, not fetch: the OAuth flow is a full-page redirect to Google and back.
export function GoogleButton() {
  return (
    <a className="google-button" href="/api/auth/google">
      Continue with Google
    </a>
  )
}
