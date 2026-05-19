import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { FormsModule } from '@angular/forms'

import {
  AiAssistantSettings,
  AiAssistantSettingsUpdate
} from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { CheckboxComponent } from '../../elements/checkbox/checkbox.component'
import { InputListComponent } from '../../elements/input-list/input-list.component'

@Component({
  selector: 'app-ai-settings-form',
  standalone: true,
  imports: [CommonModule, FormsModule, CheckboxComponent, InputListComponent],
  templateUrl: './ai-settings-form.component.html',
  styleUrl: './ai-settings-form.component.scss'
})
export class AiSettingsFormComponent implements OnChanges {
  @Input() settings: AiAssistantSettings | null = null
  @Input() saving: boolean = false
  @Output() save = new EventEmitter<AiAssistantSettingsUpdate>()
  @Output() cancel = new EventEmitter<void>()

  apiKey: string = ''
  model: string = 'gpt-5.4-mini'
  baseUrl: string = 'https://api.openai.com/v1/chat/completions'
  clearApiKey: boolean = false
  customEndpointEnabled: boolean = false
  readonly defaultModelOptions: { label: string, value: string }[] = [
    { label: 'GPT-5.5', value: 'gpt-5.5' },
    { label: 'GPT-5.4', value: 'gpt-5.4' },
    { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini' },
    { label: 'GPT-5.4 nano', value: 'gpt-5.4-nano' },
    { label: 'GPT-5.2', value: 'gpt-5.2' },
    { label: 'GPT-5.1', value: 'gpt-5.1' },
    { label: 'GPT-5', value: 'gpt-5' },
    { label: 'GPT-5 mini', value: 'gpt-5-mini' },
    { label: 'GPT-5 nano', value: 'gpt-5-nano' },
    { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
    { label: 'GPT-4.1 nano', value: 'gpt-4.1-nano' },
    { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'o4-mini', value: 'o4-mini' }
  ]

  constructor(private language: AppLanguageService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['settings']) {
      return
    }

    this.model = this.settings?.model || this.model
    this.baseUrl = this.settings?.baseUrl || this.baseUrl
    this.customEndpointEnabled = this.baseUrl !== 'https://api.openai.com/v1/chat/completions'
    this.apiKey = ''
    this.clearApiKey = false
  }

  onCustomEndpointChanged(enabled: boolean): void {
    this.customEndpointEnabled = enabled

    if (!enabled) {
      this.baseUrl = 'https://api.openai.com/v1/chat/completions'
    }
  }

  get modelOptions(): { [key: string]: string | number }[] {
    if (!this.model || this.defaultModelOptions.some((option) => option.value === this.model)) {
      return this.defaultModelOptions
    }

    return [
      { label: `${this.model} (${this.t('aiAssistant.currentModel')})`, value: this.model },
      ...this.defaultModelOptions
    ]
  }

  onModelSelected(item: { [key: string]: string | number } | null): void {
    const value = item?.['value']
    this.model = typeof value === 'string' ? value : ''
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
