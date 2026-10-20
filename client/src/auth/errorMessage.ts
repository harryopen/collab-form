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
