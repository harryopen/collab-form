import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as authApi from '../api/auth.ts'
import { AuthContext, type AuthContextValue } from './AuthContext.ts'

const ME_KEY = ['auth', 'me']

// Asks the server who we are on mount (GET /api/auth/me) and keeps that answer
// in the query cache, so login/signup/logout just update it.
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ME_KEY, queryFn: authApi.fetchMe, retry: false, staleTime: Infinity })

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  })
  const signup = useMutation({
    mutationFn: authApi.signup,
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  })
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Drop everything cached for the previous user.
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
    },
  })

  const value: AuthContextValue = {
    user: me.data ?? null,
    loading: me.isPending,
    login: login.mutateAsync,
    signup: signup.mutateAsync,
    logout: logout.mutateAsync,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
