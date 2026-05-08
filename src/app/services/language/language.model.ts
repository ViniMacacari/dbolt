export type AppLanguage = 'en' | 'pt-BR'

export interface AppLanguageOption {
  value: AppLanguage
  label: string
}

export type TranslationCatalog = Record<string, string>

export const DEFAULT_APP_LANGUAGE: AppLanguage = 'en'

export const APP_LANGUAGE_OPTIONS: AppLanguageOption[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Portugues (Brasil)' }
]

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === 'pt-BR' ? 'pt-BR' : DEFAULT_APP_LANGUAGE
}
