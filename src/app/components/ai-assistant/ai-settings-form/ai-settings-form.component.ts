import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { FormsModule } from '@angular/forms'

import {
  AiAssistantSettings,
  AiAssistantSettingsUpdate
} from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { CheckboxComponent } from '../../elements/checkbox/checkbox.component'

@Component({
  selector: 'app-ai-settings-form',
  standalone: true,
  imports: [CommonModule, FormsModule, CheckboxComponent],
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
  customEndpointEnabled: boolean = false

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
