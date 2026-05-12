import { Component, EventEmitter, Input, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-query-assistant',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-assistant.component.html',
  styleUrl: './query-assistant.component.scss'
})
export class QueryAssistantComponent {
  @Input() tabInfo: any
  @Output() selectBuilderRequested = new EventEmitter<any>()

  constructor(private language: AppLanguageService) { }

  openSelectBuilder(): void {
    this.selectBuilderRequested.emit({
      context: this.tabInfo?.dbInfo
    })
  }

  get connectionLabel(): string {
    const dbInfo = this.tabInfo?.dbInfo
    return [dbInfo?.sgbd, dbInfo?.database, dbInfo?.schema]
      .filter(Boolean)
      .join(' / ') || this.t('queryAssistant.noConnectionSelected')
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
