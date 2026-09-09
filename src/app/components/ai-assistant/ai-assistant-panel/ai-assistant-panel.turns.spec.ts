import { AiAssistantPanelComponent } from './ai-assistant-panel.component'
import { AiChatMessage } from '../../../services/ai-assistant/ai-assistant.model'

describe('AiAssistantPanelComponent turns', () => {
  const conversationId = 'conversation-example'

  const createConversationsService = () => ({
    saveConversation: jasmine.createSpy().and.callFake(async (_id: string, messages: AiChatMessage[]) => ({
      activeConversationId: conversationId,
      conversations: [{
        id: conversationId,
        title: 'Example',
        messages,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }]
    }))
  })

  const createComponent = (chatService: unknown): AiAssistantPanelComponent => {
    const component = new AiAssistantPanelComponent(
      {} as any,
      chatService as any,
      createConversationsService() as any,
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
        maxToolTranscriptChars: 48000
      }
    }
    component.activeConversationId = conversationId

    return component
  }

  const waitFor = async (predicate: () => boolean, attempts: number = 200): Promise<void> => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (predicate()) return
      await Promise.resolve()
    }
  }

  const send = async (component: AiAssistantPanelComponent, message: string): Promise<void> => {
    await component.onSend({
      message,
      allowDatabaseContext: false,
      includeCurrentSql: false
    })
  }

  it('retries an answer from the point of the conversation it was generated at', async () => {
    const chatService = {
      sendMessage: jasmine.createSpy().and.returnValues(
        Promise.resolve({ message: 'First answer', model: 'm' }),
        Promise.resolve({ message: 'Second answer', model: 'm' })
      )
    }
    const component = createComponent(chatService)

    await send(component, 'Which tables exist?')
    expect(component.messages.map((message) => message.content)).toEqual(['Which tables exist?', 'First answer'])

    await component.onRetryMessage(component.messages[1])

    expect(component.messages.map((message) => message.content)).toEqual(['Which tables exist?', 'Second answer'])
    expect(chatService.sendMessage).toHaveBeenCalledTimes(2)
    expect(chatService.sendMessage.calls.mostRecent().args[0]).toEqual([
      { role: 'user', content: 'Which tables exist?' }
    ])
  })

  it('records the thinking time on the answer and keeps it after saving', async () => {
    const chatService = {
      sendMessage: jasmine.createSpy().and.callFake(() => new Promise((resolve) => {
        setTimeout(() => resolve({ message: 'Answer', model: 'm' }), 1100)
      }))
    }
    const component = createComponent(chatService)

    await send(component, 'Which tables exist?')

    const answer = component.messages[1]
    expect(answer.role).toBe('assistant')
    expect(answer.thinkingSeconds).toBeGreaterThan(0)
    expect(component.messages[0].thinkingSeconds).toBeUndefined()
  })

  it('retries an answer that failed', async () => {
    const chatService = {
      sendMessage: jasmine.createSpy().and.returnValues(
        Promise.reject(new Error('fetch failed')),
        Promise.resolve({ message: 'Recovered answer', model: 'm' })
      )
    }
    const component = createComponent(chatService)

    await send(component, 'Which tables exist?')
    expect(component.messages[1].error).toBeTrue()
    expect(component.canRetryMessage(component.messages[1])).toBeTrue()

    await component.onRetryMessage(component.messages[1])

    expect(component.messages.map((message) => message.content)).toEqual(['Which tables exist?', 'Recovered answer'])
    expect(component.messages[1].error).toBeFalsy()
  })

  it('replays the conversation from an edited message and drops everything after it', async () => {
    const chatService = {
      sendMessage: jasmine.createSpy().and.returnValues(
        Promise.resolve({ message: 'Answer one', model: 'm' }),
        Promise.resolve({ message: 'Answer two', model: 'm' }),
        Promise.resolve({ message: 'Answer for the edited question', model: 'm' })
      )
    }
    const component = createComponent(chatService)

    await send(component, 'First question')
    await send(component, 'Second question')
    expect(component.messages.length).toBe(4)

    await component.onEditMessage(component.messages[0], 'First question, rewritten')

    expect(component.messages.map((message) => message.content)).toEqual([
      'First question, rewritten',
      'Answer for the edited question'
    ])
    expect(chatService.sendMessage.calls.mostRecent().args[0]).toEqual([
      { role: 'user', content: 'First question, rewritten' }
    ])
  })

  it('keeps the sent message and adds no error bubble when the answer is stopped', async () => {
    let rejectRequest: (reason: unknown) => void = () => { }
    const chatService = {
      sendMessage: jasmine.createSpy().and.callFake((
        _messages: unknown,
        _context: unknown,
        _sql: unknown,
        _auto: unknown,
        _progress: unknown,
        signal: AbortSignal
      ) => new Promise((_resolve, reject) => {
        rejectRequest = reject
        signal.addEventListener('abort', () => reject(new Error('The request was aborted.')))
      }))
    }
    const component = createComponent(chatService)

    const pending = send(component, 'Incomplete question')
    await waitFor(() => component.sending)

    expect(component.sending).toBeTrue()

    component.stopSending()
    await pending

    expect(component.sending).toBeFalse()
    expect(component.messages.map((message) => message.content)).toEqual(['Incomplete question'])
    expect(component.messages.some((message) => message.error)).toBeFalse()
    expect(rejectRequest).toBeDefined()
  })

  it('sends the stopped message together with the new information on the next send', async () => {
    let stopSignal: AbortSignal | undefined
    const chatService = {
      sendMessage: jasmine.createSpy().and.callFake((
        _messages: unknown,
        _context: unknown,
        _sql: unknown,
        _auto: unknown,
        _progress: unknown,
        signal: AbortSignal
      ) => {
        if (!stopSignal) {
          stopSignal = signal
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('The request was aborted.')))
          })
        }

        return Promise.resolve({ message: 'Answer with both parts', model: 'm' })
      })
    }
    const component = createComponent(chatService)

    const pending = send(component, 'Show the clients')
    await waitFor(() => component.sending)
    component.stopSending()
    await pending

    await send(component, 'only from Sao Paulo')

    expect(chatService.sendMessage.calls.mostRecent().args[0]).toEqual([
      { role: 'user', content: 'Show the clients' },
      { role: 'user', content: 'only from Sao Paulo' }
    ])
    expect(component.messages.map((message) => message.content)).toEqual([
      'Show the clients',
      'only from Sao Paulo',
      'Answer with both parts'
    ])
  })

  it('ignores retry and edit while an answer is in flight', async () => {
    const chatService = {
      sendMessage: jasmine.createSpy().and.callFake((
        _messages: unknown,
        _context: unknown,
        _sql: unknown,
        _auto: unknown,
        _progress: unknown,
        signal: AbortSignal
      ) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('The request was aborted.')))
      }))
    }
    const component = createComponent(chatService)

    const pending = send(component, 'Question')
    await waitFor(() => component.sending)

    const userMessage = component.messages[0]
    await component.onEditMessage(userMessage, 'Another question')
    await component.onRetryMessage({ ...userMessage, role: 'assistant' } as AiChatMessage)

    expect(chatService.sendMessage).toHaveBeenCalledTimes(1)
    expect(component.messages.map((message) => message.content)).toEqual(['Question'])

    component.stopSending()
    await pending
  })
})
