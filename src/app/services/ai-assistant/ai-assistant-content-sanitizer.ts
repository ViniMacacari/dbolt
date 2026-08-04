import { AppLanguage } from '../language/language.model'

const INTERNAL_ACTION_PATTERN = /(?:getSchemaSummary|searchObjects|getTableColumns|runReadonlyQuery)/i
const INTERNAL_TRANSPORT_PATTERN = /["']?(?:databaseActions|toolCalls?)["']?\s*:/i

export function sanitizeAiAssistantContent(content: string, language: AppLanguage): string {
  const isPortuguese = language === 'pt-BR'

  if (INTERNAL_ACTION_PATTERN.test(content) && INTERNAL_TRANSPORT_PATTERN.test(content)) {
    return isPortuguese
      ? 'Uma resposta técnica interna foi ocultada. Tente novamente.'
      : 'An internal technical response was hidden. Please try again.'
  }

  const replacements: Array<[RegExp, string]> = isPortuguese
    ? [
      [/`?getSchemaSummary`?/gi, 'leitura do schema'],
      [/`?searchObjects`?/gi, 'busca de tabelas e views'],
      [/`?getTableColumns`?/gi, 'leitura da estrutura da tabela'],
      [/`?runReadonlyQuery`?/gi, 'consulta somente leitura'],
      [/`?connectionKey`?/gi, 'acesso ao banco de dados'],
      [/`?(?:databaseActions|toolCalls?)`?/gi, 'operação interna']
    ]
    : [
      [/`?getSchemaSummary`?/gi, 'schema lookup'],
      [/`?searchObjects`?/gi, 'table and view search'],
      [/`?getTableColumns`?/gi, 'table structure lookup'],
      [/`?runReadonlyQuery`?/gi, 'read-only query'],
      [/`?connectionKey`?/gi, 'database connection'],
      [/`?(?:databaseActions|toolCalls?)`?/gi, 'internal operation']
    ]

  return replacements.reduce(
    (sanitized, [pattern, replacement]) => sanitized.replace(pattern, replacement),
    content
  )
}
