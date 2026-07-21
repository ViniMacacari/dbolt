import { TestBed } from '@angular/core/testing'

import { InternalApiService } from '../requests/internal-api.service'
import { AiAssistantConversationsState, ApiResponse } from './ai-assistant.model'
import { AiAssistantConversationsService } from './ai-assistant-conversations.service'

describe('AiAssistantConversationsService', () => {
  let service: AiAssistantConversationsService
  let internalApi: jasmine.SpyObj<InternalApiService>

  const state = (id: string, messageCount: number): AiAssistantConversationsState => ({
    activeConversationId: id,
    conversations: [{
      id,
      title: messageCount ? 'Saved chat' : 'New chat',
      messages: messageCount ? [{
        id: `${id}-message`,
        role: 'user',
        content: 'Hello',
        createdAt: '2026-07-20T00:00:00.000Z'
      }] : [],
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z'
    }]
  })

  const response = (value: AiAssistantConversationsState): ApiResponse<AiAssistantConversationsState> => ({
    success: true,
    data: value
  })

  beforeEach(() => {
    internalApi = jasmine.createSpyObj<InternalApiService>('InternalApiService', ['get', 'post', 'put', 'delete'])

    TestBed.configureTestingModule({
      providers: [
        AiAssistantConversationsService,
        { provide: InternalApiService, useValue: internalApi }
      ]
    })
    service = TestBed.inject(AiAssistantConversationsService)
  })

  it('starts one fresh conversation when the app session loads a chat with messages', async () => {
    const savedState = state('saved', 1)
    const freshState = state('fresh', 0)
    internalApi.get.and.returnValue(Promise.resolve(response(savedState)))
    internalApi.post.and.returnValue(Promise.resolve(response(freshState)))

    expect(await service.loadConversations()).toEqual(freshState)
    expect(internalApi.post).toHaveBeenCalledOnceWith('/api/ai-assistant/conversations', {})

    expect(await service.loadConversations()).toEqual(savedState)
    expect(internalApi.post).toHaveBeenCalledTimes(1)
  })

  it('reuses an empty active conversation instead of accumulating blank chats', async () => {
    const freshState = state('fresh', 0)
    internalApi.get.and.returnValue(Promise.resolve(response(freshState)))

    expect(await service.loadConversations()).toEqual(freshState)
    expect(internalApi.post).not.toHaveBeenCalled()
  })

  it('deletes every conversation through the collection endpoint', async () => {
    const freshState = state('fresh', 0)
    internalApi.delete.and.returnValue(Promise.resolve(response(freshState)))

    expect(await service.deleteAllConversations()).toEqual(freshState)
    expect(internalApi.delete).toHaveBeenCalledOnceWith('/api/ai-assistant/conversations')
  })
})
