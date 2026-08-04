import { TestBed } from '@angular/core/testing'

import { AiAssistantSettingsService } from './ai-assistant-settings.service'
import { OpenAiOAuthSessionService } from './openai-oauth-session.service'

describe('OpenAiOAuthSessionService', () => {
  let service: OpenAiOAuthSessionService
  let settingsService: jasmine.SpyObj<AiAssistantSettingsService>

  beforeEach(() => {
    settingsService = jasmine.createSpyObj<AiAssistantSettingsService>('AiAssistantSettingsService', [
      'loadOpenAiOAuthStatus',
      'startOpenAiOAuthLogin',
      'openOpenAiOAuthAuthorizationUrl',
      'disconnectOpenAiOAuth',
      'loadOpenAiOAuthModels'
    ])

    TestBed.configureTestingModule({
      providers: [
        OpenAiOAuthSessionService,
        { provide: AiAssistantSettingsService, useValue: settingsService }
      ]
    })
    service = TestBed.inject(OpenAiOAuthSessionService)
  })

  it('reuses an existing ChatGPT session without opening a browser', async () => {
    const status = {
      connected: true,
      signingIn: false,
      secureStorageAvailable: true
    }
    settingsService.loadOpenAiOAuthStatus.and.resolveTo(status)

    await expectAsync(service.signIn()).toBeResolvedTo(status)
    expect(settingsService.startOpenAiOAuthLogin).not.toHaveBeenCalled()
    expect(settingsService.openOpenAiOAuthAuthorizationUrl).not.toHaveBeenCalled()
  })

  it('refuses login when protected credential storage is unavailable', async () => {
    settingsService.loadOpenAiOAuthStatus.and.resolveTo({
      connected: false,
      signingIn: false,
      secureStorageAvailable: false
    })

    await expectAsync(service.signIn()).toBeRejectedWithError(
      'Secure credential storage is unavailable on this system.'
    )
    expect(settingsService.startOpenAiOAuthLogin).not.toHaveBeenCalled()
  })

  it('loads only the models returned for the connected account', async () => {
    settingsService.loadOpenAiOAuthModels.and.resolveTo(['gpt-5.6-sol', 'gpt-5.6-terra'])

    await expectAsync(service.loadModels()).toBeResolvedTo(['gpt-5.6-sol', 'gpt-5.6-terra'])
  })
})
