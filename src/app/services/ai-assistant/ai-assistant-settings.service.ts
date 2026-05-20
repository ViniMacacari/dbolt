import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import { AiAssistantSettings, AiAssistantSettingsUpdate, ApiResponse } from './ai-assistant.model'

@Injectable({
  providedIn: 'root'
})
export class AiAssistantSettingsService {
  constructor(private internalApi: InternalApiService) { }

  async loadSettings(): Promise<AiAssistantSettings> {
    const response = await this.internalApi.get<ApiResponse<AiAssistantSettings>>('/api/ai-assistant/settings')

    if (!response.success || !response.data) {
      throw new Error(response.message || response.error || 'Could not load AI settings.')
    }

    return response.data
  }

  async saveSettings(settings: AiAssistantSettingsUpdate): Promise<AiAssistantSettings> {
    const response = await this.internalApi.put<ApiResponse<AiAssistantSettings>>('/api/ai-assistant/settings', settings)

    if (!response.success || !response.data) {
      throw new Error(response.message || response.error || 'Could not save AI settings.')
    }

    return response.data
  }
}
