import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import {
  AiAssistantSettings,
  AiAssistantSettingsUpdate,
  ApiResponse,
  OpenAiOAuthLoginStart,
  OpenAiOAuthStatus
} from './ai-assistant.model'

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

  async loadOpenAiOAuthStatus(): Promise<OpenAiOAuthStatus> {
    return await this.readData(
      await this.internalApi.get<ApiResponse<OpenAiOAuthStatus>>('/api/ai-assistant/openai-oauth/status'),
      'Could not load ChatGPT login status.'
    )
  }

  async startOpenAiOAuthLogin(): Promise<OpenAiOAuthLoginStart> {
    return await this.readData(
      await this.internalApi.post<ApiResponse<OpenAiOAuthLoginStart>>('/api/ai-assistant/openai-oauth/login', {}),
      'Could not start ChatGPT login.'
    )
  }

  async disconnectOpenAiOAuth(): Promise<OpenAiOAuthStatus> {
    return await this.readData(
      await this.internalApi.delete<ApiResponse<OpenAiOAuthStatus>>('/api/ai-assistant/openai-oauth/session'),
      'Could not disconnect ChatGPT.'
    )
  }

  async loadOpenAiOAuthModels(): Promise<string[]> {
    return await this.readData(
      await this.internalApi.get<ApiResponse<string[]>>('/api/ai-assistant/openai-oauth/models'),
      'Could not load the models available for this ChatGPT account.'
    )
  }

  async dismissOpenAiOAuthRecommendation(): Promise<AiAssistantSettings> {
    return await this.readData(
      await this.internalApi.post<ApiResponse<AiAssistantSettings>>(
        '/api/ai-assistant/openai-oauth/recommendation/dismiss',
        {}
      ),
      'Could not dismiss the ChatGPT recommendation.'
    )
  }

  async openOpenAiOAuthAuthorizationUrl(authorizationUrl: string): Promise<void> {
    if (window.dboltOpenAiOAuth) {
      await window.dboltOpenAiOAuth.openAuthorizationUrl(authorizationUrl)
      return
    }

    const authorizationWindow = window.open(authorizationUrl, '_blank', 'noopener,noreferrer')
    if (!authorizationWindow) {
      throw new Error('The browser blocked the ChatGPT login window.')
    }
  }

  private async readData<T>(response: ApiResponse<T>, fallback: string): Promise<T> {
    if (!response.success || response.data === undefined) {
      throw new Error(response.message || response.error || fallback)
    }

    return response.data
  }
}
