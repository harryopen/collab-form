import { http } from './http.ts'

export type DocumentRole = 'owner' | 'editor' | 'viewer'

export interface DocumentSummary {
  id: string
  title: string
  shareMode: 'OFF' | 'VIEWER' | 'EDITOR'
  createdAt: string
  updatedAt: string
  owner: { id: string; name: string }
  role: DocumentRole
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  return (await http<{ documents: DocumentSummary[] }>('/documents')).documents
}

export async function createDocument(title?: string): Promise<DocumentSummary> {
  return (await http<{ document: DocumentSummary }>('/documents', { method: 'POST', body: title ? { title } : {} })).document
}

export async function renameDocument(id: string, title: string): Promise<DocumentSummary> {
  return (await http<{ document: DocumentSummary }>(`/documents/${id}`, { method: 'PATCH', body: { title } })).document
}

export function deleteDocument(id: string): Promise<void> {
  return http<void>(`/documents/${id}`, { method: 'DELETE' })
}
