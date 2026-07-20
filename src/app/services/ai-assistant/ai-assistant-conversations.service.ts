import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import {
  AiChatMessage,
  AiAssistantConversationsState,
  ApiResponse
} from './ai-assistant.model'

@Injectable({
  providedIn: 'root'
})
export class AiAssistantConversationsService {
  private sessionConversationInitialized: boolean = false

  constructor(private internalApi: InternalApiService) { }

  async loadConversations(): Promise<AiAssistantConversationsState> {
    const response = await this.internalApi.get<ApiResponse<AiAssistantConversationsState>>('/api/ai-assistant/conversations')
    const state = this.readResponse(response, 'Could not load AI conversations.')

    if (this.sessionConversationInitialized) {
      return state
    }

    const activeConversation = state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    )

    if (activeConversation?.messages.length === 0) {
      this.sessionConversationInitialized = true
      return state
    }

    const freshState = await this.createConversation()
    this.sessionConversationInitialized = true
    return freshState
  }

  async createConversation(): Promise<AiAssistantConversationsState> {
    const response = await this.internalApi.post<ApiResponse<AiAssistantConversationsState>>('/api/ai-assistant/conversations', {})
    return this.readResponse(response, 'Could not create AI conversation.')
  }

  async setActiveConversation(conversationId: string): Promise<AiAssistantConversationsState> {
    const response = await this.internalApi.put<ApiResponse<AiAssistantConversationsState>>('/api/ai-assistant/conversations/active', {
      conversationId
    })
    return this.readResponse(response, 'Could not switch AI conversation.')
  }

  async saveConversation(
    conversationId: string,
    messages: AiChatMessage[]
  ): Promise<AiAssistantConversationsState> {
    const response = await this.internalApi.put<ApiResponse<AiAssistantConversationsState>>(
      `/api/ai-assistant/conversations/${encodeURIComponent(conversationId)}`,
      { messages }
    )
    return this.readResponse(response, 'Could not save AI conversation.')
  }

  async deleteConversation(conversationId: string): Promise<AiAssistantConversationsState> {
    const response = await this.internalApi.delete<ApiResponse<AiAssistantConversationsState>>(
      `/api/ai-assistant/conversations/${encodeURIComponent(conversationId)}`
    )
    return this.readResponse(response, 'Could not delete AI conversation.')
  }

  async deleteAllConversations(): Promise<AiAssistantConversationsState> {
    const response = await this.internalApi.delete<ApiResponse<AiAssistantConversationsState>>(
      '/api/ai-assistant/conversations'
    )
    return this.readResponse(response, 'Could not delete all AI conversations.')
  }

  private readResponse(
    response: ApiResponse<AiAssistantConversationsState>,
    fallback: string
  ): AiAssistantConversationsState {
    if (!response.success || !response.data) {
      throw new Error(response.message || response.error || fallback)
    }

    return response.data
  }
}
