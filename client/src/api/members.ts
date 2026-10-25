import { http } from './http.ts'

export type MemberRole = 'EDITOR' | 'VIEWER'

export interface Member {
  userId: string
  name: string
  email: string
  role: MemberRole
}

export async function listMembers(documentId: string): Promise<Member[]> {
  return (await http<{ members: Member[] }>(`/documents/${documentId}/members`)).members
}

export async function addMember(documentId: string, email: string, role: MemberRole): Promise<Member> {
  return (await http<{ member: Member }>(`/documents/${documentId}/members`, { method: 'POST', body: { email, role } })).member
}

export async function updateMemberRole(documentId: string, userId: string, role: MemberRole): Promise<Member> {
  return (await http<{ member: Member }>(`/documents/${documentId}/members/${userId}`, { method: 'PATCH', body: { role } })).member
}

export function removeMember(documentId: string, userId: string): Promise<void> {
  return http<void>(`/documents/${documentId}/members/${userId}`, { method: 'DELETE' })
}
