import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import { AppLanguageService } from '../language/app-language.service'
import {
  AiAssistantApiMessage,
  AiAssistantChatResponse,
  AiAssistantProgressStage,
  AiAssistantStreamEvent,
  AiReadonlyDatabaseToolContext
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
    readonlyContext?: AiReadonlyDatabaseToolContext,
    currentSql?: string,
    autoApplyCurrentSql: boolean = false,
    onProgress?: (stage: AiAssistantProgressStage) => void,
    signal?: AbortSignal
  ): Promise<AiAssistantChatResponse> {
    let result: AiAssistantChatResponse | undefined

    await this.internalApi.postStream<AiAssistantStreamEvent>('/api/ai-assistant/chat/stream', {
      messages,
      readonlyContext,
      currentSql,
      autoApplyCurrentSql,
      appLanguage: this.language.getCurrentLanguage()
    }, (event) => {
      if (event.type === 'progress') {
        onProgress?.(event.stage)
        return
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Could not get an AI response.')
      }

      result = event.data
    }, signal)

    if (!result) {
      throw new Error('The AI response ended before returning a result.')
    }

    return result
  }
}
