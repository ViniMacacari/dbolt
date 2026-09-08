import { TestBed } from '@angular/core/testing'

import { AppLanguageService } from '../language/app-language.service'
import { InternalApiService } from '../requests/internal-api.service'
import { AiAssistantChatService } from './ai-assistant-chat.service'
import { AiAssistantStreamEvent } from './ai-assistant.model'

describe('AiAssistantChatService', () => {
  let service: AiAssistantChatService
  let internalApi: jasmine.SpyObj<InternalApiService>

  beforeEach(() => {
    internalApi = jasmine.createSpyObj<InternalApiService>('InternalApiService', ['postStream'])

    TestBed.configureTestingModule({
      providers: [
        AiAssistantChatService,
        { provide: InternalApiService, useValue: internalApi },
        { provide: AppLanguageService, useValue: { getCurrentLanguage: () => 'pt-BR' } }
      ]
    })

    service = TestBed.inject(AiAssistantChatService)
  })

  it('forwards safe progress stages and returns the final response', async () => {
    internalApi.postStream.and.callFake(async <T>(
      _url: string,
      _body: unknown,
      onEvent: (event: T) => void
    ) => {
      onEvent({ type: 'progress', stage: 'reading-table-structure' } as AiAssistantStreamEvent as T)
      onEvent({
        type: 'result',
        data: { message: 'Resposta', model: 'test-model' }
      } as AiAssistantStreamEvent as T)
    })
    const progress = jasmine.createSpy('progress')

    const currentSql = 'SELECT * FROM sample_table'
    const response = await service.sendMessage([
      { role: 'user', content: 'Pergunta' }
    ], undefined, currentSql, progress)

    expect(progress).toHaveBeenCalledOnceWith('reading-table-structure')
    expect(internalApi.postStream).toHaveBeenCalledWith(
      '/api/ai-assistant/chat/stream',
      jasmine.objectContaining({ currentSql }),
      jasmine.any(Function)
    )
    expect(response).toEqual({ message: 'Resposta', model: 'test-model' })
  })
})
