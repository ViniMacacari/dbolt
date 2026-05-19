import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import {
  AiAssistantApiMessage,
  AiAssistantChatResponse,
  AiReadonlyDatabaseContext,
  AiReadonlyDatabaseToolContext,
  ApiResponse
} from './ai-assistant.model'

@Injectable({
  providedIn: 'root'
})
export class AiAssistantChatService {
  constructor(private internalApi: InternalApiService) { }

  async sendMessage(
    messages: AiAssistantApiMessage[],
    databaseContext?: AiReadonlyDatabaseContext,
    readonlyContext?: AiReadonlyDatabaseToolContext
  ): Promise<AiAssistantChatResponse> {
    const response = await this.internalApi.post<ApiResponse<AiAssistantChatResponse>>('/api/ai-assistant/chat', {
      messages,
      databaseContext,
      readonlyContext
    })

    if (!response.success || !response.data) {
      throw new Error(response.message || response.error || 'Não foi possível obter resposta da IA.')
    }

    return response.data
  }
}
