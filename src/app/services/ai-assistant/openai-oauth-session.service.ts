import { Injectable } from '@angular/core'

import { OpenAiOAuthStatus } from './ai-assistant.model'
import { AiAssistantSettingsService } from './ai-assistant-settings.service'

const LOGIN_POLL_INTERVAL_MS = 1000
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

@Injectable({
  providedIn: 'root'
})
export class OpenAiOAuthSessionService {
  private loginPromise: Promise<OpenAiOAuthStatus> | null = null

  constructor(private settingsService: AiAssistantSettingsService) { }

  async getStatus(): Promise<OpenAiOAuthStatus> {
    return await this.settingsService.loadOpenAiOAuthStatus()
  }

  async signIn(onStatus?: (status: OpenAiOAuthStatus) => void): Promise<OpenAiOAuthStatus> {
    if (!this.loginPromise) {
      this.loginPromise = this.runSignIn(onStatus)
        .finally(() => {
          this.loginPromise = null
        })
    }

    return await this.loginPromise
  }

  async disconnect(): Promise<OpenAiOAuthStatus> {
    return await this.settingsService.disconnectOpenAiOAuth()
  }

  async loadModels(): Promise<string[]> {
    return await this.settingsService.loadOpenAiOAuthModels()
  }

  private async runSignIn(onStatus?: (status: OpenAiOAuthStatus) => void): Promise<OpenAiOAuthStatus> {
    const initialStatus = await this.getStatus()
    onStatus?.(initialStatus)

    if (initialStatus.connected) return initialStatus
    if (!initialStatus.secureStorageAvailable) {
      throw new Error('Secure credential storage is unavailable on this system.')
    }

    const login = await this.settingsService.startOpenAiOAuthLogin()
    if (login.connected) {
      const connectedStatus = await this.getStatus()
      onStatus?.(connectedStatus)
      return connectedStatus
    }

    if (!login.authorizationUrl) {
      throw new Error('ChatGPT did not return an authorization URL.')
    }

    await this.settingsService.openOpenAiOAuthAuthorizationUrl(login.authorizationUrl)
    const deadline = Date.now() + LOGIN_TIMEOUT_MS

    while (Date.now() < deadline) {
      await this.delay(LOGIN_POLL_INTERVAL_MS)
      const status = await this.getStatus()
      onStatus?.(status)

      if (status.connected) return status
      if (!status.signingIn) {
        throw new Error(status.error || 'ChatGPT login was not completed.')
      }
    }

    throw new Error('ChatGPT login timed out. Try again.')
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
  }
}
