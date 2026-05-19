import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { InputListComponent } from '../../elements/input-list/input-list.component'
import {
  AiAssistantSettings,
  AiAssistantSettingsUpdate
} from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-ai-settings-form',
  standalone: true,
  imports: [CommonModule, FormsModule, InputListComponent],
  templateUrl: './ai-settings-form.component.html',
  styleUrl: './ai-settings-form.component.scss'
})
export class AiSettingsFormComponent implements OnChanges {
  @Input() settings: AiAssistantSettings | null = null
  @Input() saving: boolean = false
  @Output() save = new EventEmitter<AiAssistantSettingsUpdate>()
  @Output() cancel = new EventEmitter<void>()

  apiKey: string = ''
  model: string = 'gpt-4o-mini'
  baseUrl: string = 'https://api.openai.com/v1/chat/completions'
  clearApiKey: boolean = false
  selectedEndpoint: string = 'openai'
  readonly endpointOptions: { [key: string]: string | number }[] = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Compatível com OpenAI', value: 'custom' }
  ]

  constructor(private language: AppLanguageService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['settings']) {
      return
    }

    this.model = this.settings?.model || this.model
    this.baseUrl = this.settings?.baseUrl || this.baseUrl
    this.selectedEndpoint = this.baseUrl === 'https://api.openai.com/v1/chat/completions' ? 'openai' : 'custom'
    this.apiKey = ''
    this.clearApiKey = false
  }

  onEndpointSelected(item: { [key: string]: string | number } | null): void {
    const selectedValue = typeof item?.['value'] === 'string' ? item['value'] : 'custom'
    this.selectedEndpoint = selectedValue

    if (selectedValue === 'openai') {
      this.baseUrl = 'https://api.openai.com/v1/chat/completions'
    }
  }

  submit(): void {
    this.save.emit({
      model: this.model.trim(),
      baseUrl: this.baseUrl.trim(),
      apiKey: this.apiKey.trim() || undefined,
      clearApiKey: this.clearApiKey
    })
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
