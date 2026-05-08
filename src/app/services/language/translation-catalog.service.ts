import { Injectable } from '@angular/core'
import { enTranslations } from '../../i18n/en'
import { ptBrTranslations } from '../../i18n/pt-br'
import { AppLanguage, DEFAULT_APP_LANGUAGE, TranslationCatalog } from './language.model'

@Injectable({
  providedIn: 'root'
})
export class TranslationCatalogService {
  private readonly catalogs: Record<AppLanguage, TranslationCatalog> = {
    en: enTranslations,
    'pt-BR': ptBrTranslations
  }

  translate(language: AppLanguage, key: string): string {
    return this.catalogs[language]?.[key] ||
      this.catalogs[DEFAULT_APP_LANGUAGE]?.[key] ||
      key
  }
}
