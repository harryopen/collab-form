import { ApiError, http } from './http.ts'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export interface SignupInput {
  email: string
  name: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

// Resolves to null when nobody is signed in (401), rejects on other failures.
export async function fetchMe(): Promise<User | null> {
  try {
    return (await http<{ user: User }>('/auth/me')).user
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export async function signup(input: SignupInput): Promise<User> {
  return (await http<{ user: User }>('/auth/signup', { method: 'POST', body: input })).user
}

export async function login(input: LoginInput): Promise<User> {
  return (await http<{ user: User }>('/auth/login', { method: 'POST', body: input })).user
}

export function logout(): Promise<void> {
  return http<void>('/auth/logout', { method: 'POST' })
}
