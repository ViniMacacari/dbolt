import { SettingsComponent } from './settings.component'
import { AiAssistantLimits, AiAssistantSettings } from '../../../services/ai-assistant/ai-assistant.model'

const limits: AiAssistantLimits = {
  maxApiCallsPerMessage: 4,
  maxDatabaseRequestsPerMessage: 4,
  maxDatabaseRequestsPerApiCall: 2,
  maxContextMessages: 10,
  maxToolResultChars: 9000,
  maxToolTranscriptChars: 18000
}

function aiSettings(overrides: Partial<AiAssistantSettings> = {}): AiAssistantSettings {
  return {
    provider: 'openai-oauth',
    baseUrl: 'https://oauth.example.test/v1/responses',
    model: 'example-model',
    hasApiKey: false,
    hasApiKeys: {
      openai: false,
      gemini: true,
      anthropic: false,
      openrouter: false
    },
    openAiOAuthConnected: false,
    openAiOAuthRecommendationDismissed: true,
    limits,
    ...overrides
  }
}

describe('SettingsComponent AI credentials', () => {
  let settingsService: jasmine.SpyObj<any>
  let openAiOAuth: jasmine.SpyObj<any>
  let component: SettingsComponent

  beforeEach(() => {
    const appSettings = {
      getDefaultQueryRows: () => 50,
      getConnectionExpirationMinutes: () => 30,
      isSqlSyntaxValidationEnabled: () => true,
      isTableAutocompleteEnabled: () => true,
      getTableAutocompleteMatchMode: () => 'contains',
      isColumnAutocompleteEnabled: () => true,
      shouldAutoQuoteCapitalizedColumns: () => false,
      getSqlFormatterIndentSize: () => 4,
      shouldUppercaseSqlFormatterKeywords: () => true,
      getSqlFormatterCommaStyle: () => 'trailing',
      shouldAddBlankLineBetweenSqlStatements: () => true,
      shouldIndentSqlCreateBody: () => false,
      getSqlHighlightMode: () => 'dbolt-dark',
      getSqlHighlightColors: () => ({}),
      getAppLanguage: () => 'pt-br'
    }
    const language = {
      languageOptions: [],
      translate: (key: string) => key
    }
    const theme = { getTheme: () => 'dark' }

    settingsService = jasmine.createSpyObj('AiAssistantSettingsService', ['saveSettings'])
    openAiOAuth = jasmine.createSpyObj('OpenAiOAuthSessionService', ['disconnect', 'loadModels', 'signIn'])
    component = new SettingsComponent(
      appSettings as any,
      {} as any,
      {} as any,
      language as any,
      settingsService,
      openAiOAuth,
      theme as any
    )
  })

  it('removes an API key without requiring the active OAuth provider to be connected', async () => {
    component.aiSettings = aiSettings()
    settingsService.saveSettings.and.resolveTo(aiSettings({
      hasApiKeys: {
        openai: false,
        gemini: false,
        anthropic: false,
        openrouter: false
      }
    }))

    await component.removeAiApiKey('gemini')

    expect(settingsService.saveSettings).toHaveBeenCalledOnceWith({
      clearApiKeys: { gemini: true }
    })
    expect(component.hasAiApiKeyForProvider('gemini')).toBeFalse()
    expect(component.aiSettingsError).toBe('')
  })

  it('disconnects OAuth and leaves the AI assistant valid without credentials', async () => {
    component.aiSettings = aiSettings({
      hasApiKey: true,
      openAiOAuthConnected: true
    })
    component.aiOpenAiOAuthConnected = true
    openAiOAuth.disconnect.and.resolveTo({
      connected: false,
      signingIn: false,
      secureStorageAvailable: true
    })

    await component.disconnectOpenAiOAuth()

    expect(openAiOAuth.disconnect).toHaveBeenCalledTimes(1)
    expect(component.aiOpenAiOAuthConnected).toBeFalse()
    expect(component.aiSettings?.openAiOAuthConnected).toBeFalse()
    expect(component.aiSettings?.hasApiKey).toBeFalse()
    expect(component.aiSettingsError).toBe('')
  })
})
