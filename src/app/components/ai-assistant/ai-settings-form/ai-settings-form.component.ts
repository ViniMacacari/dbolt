import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { FormsModule } from '@angular/forms'

import {
  AiAssistantProvider,
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
  provider: AiAssistantProvider = 'openai'
  model: string = 'gpt-5.4-mini'
  baseUrl: string = 'https://api.openai.com/v1/chat/completions'
  clearApiKey: boolean = false
  customEndpointEnabled: boolean = false
  readonly providerOptions: { label: string, value: AiAssistantProvider }[] = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Gemini', value: 'gemini' },
    { label: 'Claude', value: 'anthropic' }
  ]
  readonly openAiModelOptions: { label: string, value: string }[] = [
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
  readonly geminiModelOptions: { label: string, value: string }[] = [
    { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
    { label: 'Gemini 3.1 Flash-Lite', value: 'gemini-3.1-flash-lite' },
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Flash-Lite', value: 'gemini-2.5-flash-lite' }
  ]
  readonly anthropicModelOptions: { label: string, value: string }[] = [
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' }
  ]

  constructor(private language: AppLanguageService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['settings']) {
      return
    }

    this.provider = this.settings?.provider || 'openai'
    this.model = this.settings?.model || this.defaultModelForProvider(this.provider)
    this.baseUrl = this.settings?.baseUrl || this.baseUrl
    this.customEndpointEnabled = this.provider === 'openai' &&
      this.baseUrl !== 'https://api.openai.com/v1/chat/completions'
    this.apiKey = ''
    this.clearApiKey = false
  }

  get hasApiKeyForSelectedProvider(): boolean {
    return Boolean(this.settings?.hasApiKeys?.[this.provider])
  }

  onProviderSelected(item: { [key: string]: string | number } | null): void {
    const provider = this.normalizeProvider(item?.['value'])
    if (provider === this.provider) return

    this.provider = provider
    this.model = this.defaultModelForProvider(provider)
    this.customEndpointEnabled = false
    this.apiKey = ''
    this.clearApiKey = false

    if (provider === 'openai') {
      this.baseUrl = 'https://api.openai.com/v1/chat/completions'
    }
  }

  onCustomEndpointChanged(enabled: boolean): void {
    this.customEndpointEnabled = enabled

    if (!enabled) {
      this.baseUrl = 'https://api.openai.com/v1/chat/completions'
    }
  }

  get modelOptions(): { [key: string]: string | number }[] {
    const defaultModelOptions = this.modelOptionsForProvider(this.provider)

    if (!this.model || defaultModelOptions.some((option) => option.value === this.model)) {
      return defaultModelOptions
    }

    return [
      { label: `${this.model} (${this.t('aiAssistant.currentModel')})`, value: this.model },
      ...defaultModelOptions
    ]
  }

  onModelSelected(item: { [key: string]: string | number } | null): void {
    const value = item?.['value']
    this.model = typeof value === 'string' ? value : ''
  }

  submit(): void {
    this.save.emit({
      provider: this.provider,
      model: this.model.trim(),
      baseUrl: this.provider === 'openai' ? this.baseUrl.trim() : undefined,
      apiKey: this.apiKey.trim() || undefined,
      clearApiKey: this.clearApiKey
    })
  }

  private defaultModelForProvider(provider: AiAssistantProvider): string {
    if (provider === 'anthropic') {
      return 'claude-sonnet-4-6'
    }

    return provider === 'gemini' ? 'gemini-3.5-flash' : 'gpt-5.4-mini'
  }

  private modelOptionsForProvider(provider: AiAssistantProvider): { label: string, value: string }[] {
    if (provider === 'anthropic') {
      return this.anthropicModelOptions
    }

    return provider === 'gemini'
      ? this.geminiModelOptions
      : this.openAiModelOptions
  }

  private normalizeProvider(value: string | number | undefined): AiAssistantProvider {
    if (value === 'gemini' || value === 'anthropic') {
      return value
    }

    return 'openai'
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
