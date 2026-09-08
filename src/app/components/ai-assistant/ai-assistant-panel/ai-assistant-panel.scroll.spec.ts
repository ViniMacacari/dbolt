import { fakeAsync, tick } from '@angular/core/testing'

import { AiAssistantPanelComponent } from './ai-assistant-panel.component'

describe('AiAssistantPanelComponent conversation scrolling', () => {
  const createComponent = (): AiAssistantPanelComponent => new AiAssistantPanelComponent(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  )

  it('opens a loaded conversation at its final message', () => {
    const component = createComponent()
    const container = {
      scrollHeight: 840,
      scrollTop: 0
    }

    component.messages = [{
      id: 'last-message',
      role: 'assistant',
      content: 'Last answer',
      createdAt: '2026-07-20T00:00:00.000Z'
    }]
    const componentView = component as unknown as {
      messagesContainer: { nativeElement: typeof container }
    }
    componentView.messagesContainer = { nativeElement: container }

    component.ngAfterViewChecked()

    expect(container.scrollTop).toBe(840)
  })

  it('keeps the conversations modal mounted during its closing animation', fakeAsync(() => {
    const component = createComponent()

    component.openConversationsModal()
    component.closeConversationsModal()

    expect(component.showConversationsModal).toBeTrue()
    expect(component.conversationsModalClosing).toBeTrue()

    tick(180)

    expect(component.showConversationsModal).toBeFalse()
    expect(component.conversationsModalClosing).toBeFalse()
  }))

  it('reads the current SQL only from the active SQL tab', () => {
    const component = createComponent()
    component.tabInfo = {
      type: 'sql',
      info: { sql: '  SELECT * FROM sample_table  ' }
    }

    expect(component.currentSqlContext).toBe('SELECT * FROM sample_table')
    expect(component.currentSqlContextAvailable).toBeTrue()

    component.tabInfo = { type: 'settings', info: { sql: 'SELECT 1' } }

    expect(component.currentSqlContext).toBe('')
    expect(component.currentSqlContextAvailable).toBeFalse()
  })

  it('forwards the active SQL as request context when explicitly enabled', async () => {
    const conversationId = 'conversation-example'
    const chatService = {
      sendMessage: jasmine.createSpy().and.resolveTo({ message: 'Explanation', model: 'example-model' })
    }
    const conversationsService = {
      saveConversation: jasmine.createSpy().and.callFake(async (_id: string, messages: any[]) => ({
        activeConversationId: conversationId,
        conversations: [{
          id: conversationId,
          title: 'Example',
          messages,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }]
      }))
    }
    const component = new AiAssistantPanelComponent(
      {} as any,
      chatService as any,
      conversationsService as any,
      {} as any,
      { translate: (key: string) => key } as any,
      {} as any,
      {} as any
    )
    component.settings = {
      provider: 'gemini',
      baseUrl: '',
      model: 'example-model',
      hasApiKey: true,
      openAiOAuthConnected: false,
      openAiOAuthRecommendationDismissed: true,
      limits: {
        maxApiCallsPerMessage: 4,
        maxDatabaseRequestsPerMessage: 4,
        maxDatabaseRequestsPerApiCall: 2,
        maxContextMessages: 10,
        maxToolResultChars: 9000,
        maxToolTranscriptChars: 18000
      }
    }
    component.activeConversationId = conversationId
    component.tabInfo = {
      type: 'sql',
      info: { sql: 'SELECT * FROM sample_table' }
    }

    await component.onSend({
      message: 'Explain this query',
      allowDatabaseContext: false,
      includeCurrentSql: true
    })

    expect(chatService.sendMessage).toHaveBeenCalledWith(
      jasmine.any(Array),
      undefined,
      'SELECT * FROM sample_table',
      jasmine.any(Function)
    )
  })

  it('offers contextual SQL for explicit replacement without changing the editor automatically', async () => {
    const conversationId = 'conversation-update'
    const replacementSql = 'SELECT\n  column_b\nFROM table_a'
    const chatService = {
      sendMessage: jasmine.createSpy().and.resolveTo({
        message: `Updated query:\n\`\`\`sql\n${replacementSql}\n\`\`\``,
        model: 'example-model'
      })
    }
    const conversationsService = {
      saveConversation: jasmine.createSpy().and.callFake(async (_id: string, messages: any[]) => ({
        activeConversationId: conversationId,
        conversations: [{
          id: conversationId,
          title: 'Example',
          messages,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }]
      }))
    }
    const component = new AiAssistantPanelComponent(
      {} as any,
      chatService as any,
      conversationsService as any,
      {} as any,
      { translate: (key: string) => key } as any,
      {} as any,
      {} as any
    )
    component.settings = {
      provider: 'gemini',
      baseUrl: '',
      model: 'example-model',
      hasApiKey: true,
      openAiOAuthConnected: false,
      openAiOAuthRecommendationDismissed: true,
      limits: {
        maxApiCallsPerMessage: 4,
        maxDatabaseRequestsPerMessage: 4,
        maxDatabaseRequestsPerApiCall: 2,
        maxContextMessages: 10,
        maxToolResultChars: 9000,
        maxToolTranscriptChars: 18000
      }
    }
    component.activeConversationId = conversationId
    const targetTab = {
      type: 'sql',
      info: { sql: 'SELECT\n  column_a\nFROM table_a' }
    }
    component.tabInfo = targetTab
    let editorRequest: any
    component.sqlRequested.subscribe((request) => editorRequest = request)

    await component.onSend({
      message: 'Update the selected column',
      allowDatabaseContext: false,
      includeCurrentSql: true
    })

    expect(editorRequest).toBeUndefined()
    const assistantMessage = component.messages[component.messages.length - 1]
    expect(component.getSqlAction(assistantMessage)).toBe('replace-current')

    component.openSqlInEditor(replacementSql, assistantMessage)

    expect(editorRequest).toEqual({
      sql: replacementSql,
      mode: 'replace-current',
      targetTab
    })
  })

  it('never replaces contextual SQL automatically when the AI returns only a fragment', async () => {
    const conversationId = 'conversation-fragment'
    const conversationsService = {
      saveConversation: jasmine.createSpy().and.callFake(async (_id: string, messages: any[]) => ({
        activeConversationId: conversationId,
        conversations: [{
          id: conversationId,
          title: 'Example',
          messages,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }]
      }))
    }
    const component = new AiAssistantPanelComponent(
      {} as any,
      {
        sendMessage: jasmine.createSpy().and.resolveTo({
          message: '```sql\nWHERE 1 = 1\n```',
          model: 'example-model'
        })
      } as any,
      conversationsService as any,
      {} as any,
      { translate: (key: string) => key } as any,
      {} as any,
      {} as any
    )
    component.settings = {
      provider: 'gemini',
      baseUrl: '',
      model: 'example-model',
      hasApiKey: true,
      openAiOAuthConnected: false,
      openAiOAuthRecommendationDismissed: true,
      limits: {
        maxApiCallsPerMessage: 4,
        maxDatabaseRequestsPerMessage: 4,
        maxDatabaseRequestsPerApiCall: 2,
        maxContextMessages: 10,
        maxToolResultChars: 9000,
        maxToolTranscriptChars: 18000
      }
    }
    component.activeConversationId = conversationId
    component.tabInfo = {
      type: 'sql',
      info: { sql: 'SELECT column_a FROM table_a' }
    }
    const editorRequests: any[] = []
    component.sqlRequested.subscribe((request) => editorRequests.push(request))

    await component.onSend({
      message: 'Add a filter',
      allowDatabaseContext: false,
      includeCurrentSql: true
    })

    expect(editorRequests).toEqual([])
    expect(component.messages[component.messages.length - 1].content).toContain('WHERE 1 = 1')
  })

  it('ensures a live connection before building readonly AI context', async () => {
    const connectedContext = {
      connectionKey: 'ai-context',
      connId: 7,
      sgbd: 'mysql',
      version: 'v5',
      database: 'sales'
    }
    const databaseContext = {
      buildRuntimeConnectionContext: jasmine.createSpy().and.returnValue({
        connId: 7,
        sgbd: 'mysql',
        version: 'v5',
        database: 'sales'
      }),
      buildReadonlyToolContext: jasmine.createSpy().and.returnValue({
        connectionKey: 'ai-context',
        sgbd: 'mysql',
        version: 'v5',
        database: 'sales'
      })
    }
    const connectionContext = {
      createContext: jasmine.createSpy().and.returnValue(connectedContext),
      ensureContext: jasmine.createSpy().and.resolveTo(connectedContext)
    }
    const component = new AiAssistantPanelComponent(
      {} as any,
      {} as any,
      {} as any,
      databaseContext as any,
      {} as any,
      connectionContext as any,
      {} as any
    )

    const result = await (component as any).prepareReadonlyToolContext()

    expect(connectionContext.ensureContext).toHaveBeenCalledOnceWith(connectedContext)
    expect(databaseContext.buildReadonlyToolContext).toHaveBeenCalled()
    expect(result.connectionKey).toBe('ai-context')
  })

  it('keeps another configured provider usable without a connected ChatGPT account', () => {
    const configuredSettings = {
      provider: 'gemini' as const,
      baseUrl: '',
      model: 'gemini-test',
      hasApiKey: true,
      hasApiKeys: {
        openai: false,
        gemini: true,
        anthropic: false,
        openrouter: false
      },
      openAiOAuthConnected: false,
      openAiOAuthRecommendationDismissed: true,
      limits: {
        maxApiCallsPerMessage: 4,
        maxDatabaseRequestsPerMessage: 4,
        maxDatabaseRequestsPerApiCall: 2,
        maxContextMessages: 10,
        maxToolResultChars: 9000,
        maxToolTranscriptChars: 18000
      }
    }
    const component = new AiAssistantPanelComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { translate: (key: string) => key } as any,
      {} as any,
      {} as any
    )
    component.settings = configuredSettings

    expect(component.canChat).toBeTrue()
    expect(component.settings.provider).toBe('gemini')
    expect(component.settings.openAiOAuthConnected).toBeFalse()
  })

  it('changes the active model from the conversation without clearing its messages', async () => {
    const currentSettings = {
      provider: 'gemini' as const,
      baseUrl: '',
      model: 'gemini-3.5-flash',
      hasApiKey: true,
      openAiOAuthConnected: false,
      openAiOAuthRecommendationDismissed: true,
      limits: {
        maxApiCallsPerMessage: 4,
        maxDatabaseRequestsPerMessage: 4,
        maxDatabaseRequestsPerApiCall: 2,
        maxContextMessages: 10,
        maxToolResultChars: 9000,
        maxToolTranscriptChars: 18000
      }
    }
    const savedSettings = { ...currentSettings, model: 'gemini-2.5-pro' }
    const settingsService = {
      saveSettings: jasmine.createSpy().and.resolveTo(savedSettings)
    }
    const component = new AiAssistantPanelComponent(
      settingsService as any,
      {} as any,
      {} as any,
      {} as any,
      { translate: (key: string) => key } as any,
      {} as any,
      {} as any
    )
    component.settings = currentSettings
    component.modelOptions = [
      { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' }
    ]
    component.messages = [{
      id: 'existing-message',
      role: 'user',
      content: 'Keep this message',
      createdAt: '2026-08-04T00:00:00.000Z'
    }]

    await component.onModelSelected({ value: 'gemini-2.5-pro' })

    expect(settingsService.saveSettings).toHaveBeenCalledOnceWith({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      baseUrl: undefined,
      limits: currentSettings.limits
    })
    expect(component.settings?.model).toBe('gemini-2.5-pro')
    expect(component.messages.length).toBe(1)
    expect(component.modelStatusMessage).toBeTruthy()
  })
})
