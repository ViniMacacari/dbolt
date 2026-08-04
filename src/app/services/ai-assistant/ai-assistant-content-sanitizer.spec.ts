import { sanitizeAiAssistantContent } from './ai-assistant-content-sanitizer'

describe('sanitizeAiAssistantContent', () => {
  it('replaces internal command names in saved Portuguese messages', () => {
    const result = sanitizeAiAssistantContent(
      'As tentativas de `getSchemaSummary` e `searchObjects` falharam por causa do connectionKey.',
      'pt-BR'
    )

    expect(result).not.toContain('getSchemaSummary')
    expect(result).not.toContain('searchObjects')
    expect(result).not.toContain('connectionKey')
    expect(result).toContain('leitura do schema')
  })

  it('hides raw database action transport', () => {
    const result = sanitizeAiAssistantContent(
      '{"databaseActions":[{"name":"searchObjects","arguments":{"search":"customer"}}]}',
      'en'
    )

    expect(result).toBe('An internal technical response was hidden. Please try again.')
  })
})
