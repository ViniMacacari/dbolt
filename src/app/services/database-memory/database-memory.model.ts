export type DatabaseMemoryNoteSource = 'ai' | 'user'

export interface DatabaseMemoryScope {
  sgbd?: string
  connectionName?: string
  database?: string
  schema?: string
}

export interface DatabaseMemoryNote {
  id: string
  topic: string
  text: string
  source: DatabaseMemoryNoteSource
  createdAt: string
  updatedAt: string
}

export interface DatabaseMemoryNoteInput {
  topic?: string
  text?: string
}

export interface DatabaseMemoryRecord {
  version: number
  scope: DatabaseMemoryScope
  notes: DatabaseMemoryNote[]
  createdAt: string
  updatedAt: string
}

export interface DatabaseMemoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface DatabaseMemoryProposedNote {
  topic: string
  text: string
}

export interface DatabaseMemoryInterviewResult {
  message: string
  question: string
  proposedNotes: DatabaseMemoryProposedNote[]
  inspectedTables: string[]
  executedQueries: string[]
  model: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}
