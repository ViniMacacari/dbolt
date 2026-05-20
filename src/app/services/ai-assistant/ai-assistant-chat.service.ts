import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import { AppLanguageService } from '../language/app-language.service'
import {
  AiAssistantApiMessage,
  AiAssistantChatResponse,
  AiReadonlyDatabaseToolContext,
  ApiResponse
} from './ai-assistant.model'

@Injectable({
  providedIn: 'root'
})
export class AiAssistantChatService {
  constructor(
    private internalApi: InternalApiService,
    private language: AppLanguageService
  ) { }

  async sendMessage(
    messages: AiAssistantApiMessage[],
    readonlyContext?: AiReadonlyDatabaseToolContext
  ): Promise<AiAssistantChatResponse> {
    const response = await this.internalApi.post<ApiResponse<AiAssistantChatResponse>>('/api/ai-assistant/chat', {
      messages,
      readonlyContext,
      appLanguage: this.language.getCurrentLanguage()
    })

    if (!response.success || !response.data) {
      throw new Error(response.message || response.error || 'Could not get an AI response.')
    }

    return response.data
  }
}
