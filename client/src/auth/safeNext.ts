// Post-login redirect target. Only same-origin paths starting with a single "/"
// are accepted; anything else (absolute URLs, "//host", backslash tricks) falls back to "/".
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  try {
    const url = new URL(raw, window.location.origin)
    // The URL parser strips tabs/newlines, so "/\t/evil.com" would become "//evil.com".
    if (url.origin !== window.location.origin) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}
