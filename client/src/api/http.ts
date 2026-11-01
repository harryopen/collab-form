// Thin fetch wrapper for the JSON API. Server errors arrive as
// { error: { code, message } } and are surfaced as ApiError.
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

export async function http<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      // The server only accepts JSON on non-GET requests (CSRF defence), even with no body.
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server')
  }

  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(res.status, error?.code ?? 'UNKNOWN', error?.message ?? `Request failed (${res.status})`)
  }
  return data as T
}
