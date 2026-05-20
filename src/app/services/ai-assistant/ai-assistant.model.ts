export type AiChatRole = 'user' | 'assistant'
export type AiAssistantProvider = 'openai' | 'gemini' | 'anthropic'

export interface AiAssistantSettings {
  provider: AiAssistantProvider
  baseUrl: string
  model: string
  hasApiKey: boolean
  hasApiKeys?: Record<AiAssistantProvider, boolean>
  maskedApiKey?: string
}

export interface AiAssistantSettingsUpdate {
  provider: AiAssistantProvider
  baseUrl?: string
  model: string
  apiKey?: string
  clearApiKey?: boolean
}

export interface AiChatMessage {
  id: string
  role: AiChatRole
  content: string
  createdAt: string
  error?: boolean
}

export interface AiAssistantConversation {
  id: string
  title: string
  messages: AiChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface AiAssistantConversationsState {
  activeConversationId: string
  conversations: AiAssistantConversation[]
}

export interface AiChatInputSubmit {
  message: string
  allowDatabaseContext: boolean
}

export interface AiAssistantApiMessage {
  role: AiChatRole
  content: string
}

export interface AiAssistantChatResponse {
  message: string
  model: string
}

export interface AiDatabaseObjectSummary {
  name: string
  type?: string
  table?: string
}

export interface AiReadonlyDatabaseContext {
  readonly: true
  connection: {
    name?: string
    sgbd?: string
    version?: string
    host?: string
    port?: string | number
    database?: string
    schema?: string
    user?: string
  }
  activeTab?: {
    name?: string
    type?: string
  }
  objectCounts: {
    tables: number
    views: number
    procedures: number
    indexes: number
  }
  objects: {
    tables: AiDatabaseObjectSummary[]
    views: AiDatabaseObjectSummary[]
    procedures: AiDatabaseObjectSummary[]
    indexes: AiDatabaseObjectSummary[]
  }
  truncated: boolean
}

export interface AiReadonlyDatabaseToolContext {
  sgbd?: string
  version?: string
  database?: string
  schema?: string
  connectionKey?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}
