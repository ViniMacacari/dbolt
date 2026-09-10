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

describe('SettingsComponent', () => {
  let appSettings: jasmine.SpyObj<any>
  let settingsService: jasmine.SpyObj<any>
  let openAiOAuth: jasmine.SpyObj<any>
  let component: SettingsComponent

  beforeEach(() => {
    appSettings = jasmine.createSpyObj('AppSettingsService', [
      'getDefaultQueryRows',
      'getConnectionExpirationMinutes',
      'isSqlSyntaxValidationEnabled',
      'isTableAutocompleteEnabled',
      'getTableAutocompleteMatchMode',
      'isColumnAutocompleteEnabled',
      'shouldAutoQuoteCapitalizedColumns',
      'getSqlFormatterIndentSize',
      'shouldUppercaseSqlFormatterKeywords',
      'getSqlFormatterCommaStyle',
      'shouldAddBlankLineBetweenSqlStatements',
      'shouldIndentSqlCreateBody',
      'shouldShowSqlChangeHighlights',
      'getSqlHighlightMode',
      'getSqlHighlightColors',
      'getAppLanguage',
      'setDefaultQueryRows',
      'setTableAutocompleteEnabled',
      'setSqlChangeHighlightsEnabled'
    ])
    appSettings.getDefaultQueryRows.and.returnValue(50)
    appSettings.getConnectionExpirationMinutes.and.returnValue(30)
    appSettings.isSqlSyntaxValidationEnabled.and.returnValue(true)
    appSettings.isTableAutocompleteEnabled.and.returnValue(true)
    appSettings.getTableAutocompleteMatchMode.and.returnValue('contains')
    appSettings.isColumnAutocompleteEnabled.and.returnValue(true)
    appSettings.shouldAutoQuoteCapitalizedColumns.and.returnValue(false)
    appSettings.getSqlFormatterIndentSize.and.returnValue(4)
    appSettings.shouldUppercaseSqlFormatterKeywords.and.returnValue(true)
    appSettings.getSqlFormatterCommaStyle.and.returnValue('trailing')
    appSettings.shouldAddBlankLineBetweenSqlStatements.and.returnValue(true)
    appSettings.shouldIndentSqlCreateBody.and.returnValue(false)
    appSettings.shouldShowSqlChangeHighlights.and.returnValue(true)
    appSettings.getSqlHighlightMode.and.returnValue('dbolt-dark')
    appSettings.getSqlHighlightColors.and.returnValue({})
    appSettings.getAppLanguage.and.returnValue('pt-br')
    appSettings.setDefaultQueryRows.and.callFake((value: number) => ({ defaultQueryRows: value }))
    appSettings.setTableAutocompleteEnabled.and.callFake((value: boolean) => ({ tableAutocompleteEnabled: value }))
    appSettings.setSqlChangeHighlightsEnabled.and.callFake((value: boolean) => ({ sqlChangeHighlightsEnabled: value }))
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

  it('automatically saves numeric inputs after the debounce period', () => {
    jasmine.clock().install()

    try {
      component.onDefaultRowsInput({ target: { value: '125' } } as any)

      expect(appSettings.setDefaultQueryRows).not.toHaveBeenCalled()
      jasmine.clock().tick(399)
      expect(appSettings.setDefaultQueryRows).not.toHaveBeenCalled()
      jasmine.clock().tick(1)

      expect(appSettings.setDefaultQueryRows).toHaveBeenCalledOnceWith(125)
      expect(component.savedMessage).toBe('generic.saved')
    } finally {
      jasmine.clock().uninstall()
    }
  })

  it('automatically saves toggles without waiting for a button click', () => {
    component.onTableAutocompleteChange({ target: { checked: false } } as any)

    expect(appSettings.setTableAutocompleteEnabled).toHaveBeenCalledOnceWith(false)
    expect(component.tableAutocompleteEnabled).toBeFalse()
    expect(component.tableAutocompleteSavedMessage).toBe('generic.saved')
  })

  it('automatically saves the SQL change highlight preference', () => {
    component.onSqlChangeHighlightsChange({ target: { checked: false } } as any)

    expect(appSettings.setSqlChangeHighlightsEnabled).toHaveBeenCalledOnceWith(false)
    expect(component.sqlChangeHighlightsEnabled).toBeFalse()
    expect(component.sqlChangeHighlightsSavedMessage).toBe('generic.saved')
  })

  it('automatically persists AI changes through the backend after debouncing', async () => {
    jasmine.clock().install()
    component.aiSettings = aiSettings({
      provider: 'openai',
      baseUrl: 'https://api.example.test/v1/chat/completions',
      model: 'example-model'
    })
    component.aiProvider = 'openai'
    component.aiBaseUrl = 'https://api.example.test/v1/chat/completions'
    component.aiModel = 'example-model'
    settingsService.saveSettings.and.resolveTo(component.aiSettings)

    try {
      component.onAiLimitInput('maxContextMessages', { target: { value: '12' } } as any)

      jasmine.clock().tick(399)
      expect(settingsService.saveSettings).not.toHaveBeenCalled()
      jasmine.clock().tick(1)

      expect(settingsService.saveSettings).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        provider: 'openai',
        model: 'example-model',
        limits: jasmine.objectContaining({ maxContextMessages: 12 })
      }))
      await Promise.resolve()
    } finally {
      jasmine.clock().uninstall()
    }
  })
})
