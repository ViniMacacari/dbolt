import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core'

import { AiChatInputComponent } from '../ai-chat-input/ai-chat-input.component'
import { AiChatMessageComponent } from '../ai-chat-message/ai-chat-message.component'
import { AiSettingsFormComponent } from '../ai-settings-form/ai-settings-form.component'
import { AiAssistantChatService } from '../../../services/ai-assistant/ai-assistant-chat.service'
import {
  AiAssistantApiMessage,
  AiAssistantSettings,
  AiAssistantSettingsUpdate,
  AiChatInputSubmit,
  AiChatMessage
} from '../../../services/ai-assistant/ai-assistant.model'
import { AiDatabaseContextService } from '../../../services/ai-assistant/ai-database-context.service'
import { AiAssistantSettingsService } from '../../../services/ai-assistant/ai-assistant-settings.service'

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [CommonModule, AiChatInputComponent, AiChatMessageComponent, AiSettingsFormComponent],
  templateUrl: './ai-assistant-panel.component.html',
  styleUrl: './ai-assistant-panel.component.scss'
})
export class AiAssistantPanelComponent implements OnInit {
  @Input() selectedSchemaDB: unknown
  @Input() dbSchemasData: unknown
  @Input() tabInfo: unknown
  @Output() close = new EventEmitter<void>()

  settings: AiAssistantSettings | null = null
  messages: AiChatMessage[] = []
  showSettings: boolean = false
  loadingSettings: boolean = false
  savingSettings: boolean = false
  sending: boolean = false
  errorMessage: string = ''

  constructor(
    private settingsService: AiAssistantSettingsService,
    private chatService: AiAssistantChatService,
    private databaseContext: AiDatabaseContextService
  ) { }

  async ngOnInit(): Promise<void> {
    await this.loadSettings()
  }

  get canChat(): boolean {
    return Boolean(this.settings?.hasApiKey) && !this.loadingSettings
  }

  get databaseContextAvailable(): boolean {
    return this.databaseContext.hasDatabaseContext(this.selectedSchemaDB, this.dbSchemasData)
  }

  async loadSettings(): Promise<void> {
    this.loadingSettings = true
    this.errorMessage = ''

    try {
      this.settings = await this.settingsService.loadSettings()
      this.showSettings = !this.settings.hasApiKey
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, 'Não foi possível carregar a configuração da IA.')
      this.showSettings = true
    } finally {
      this.loadingSettings = false
    }
  }

  async saveSettings(update: AiAssistantSettingsUpdate): Promise<void> {
    this.savingSettings = true
    this.errorMessage = ''

    try {
      this.settings = await this.settingsService.saveSettings(update)
      this.showSettings = !this.settings.hasApiKey
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, 'Não foi possível salvar a configuração da IA.')
    } finally {
      this.savingSettings = false
    }
  }

  async onSend(event: AiChatInputSubmit): Promise<void> {
    if (!this.settings?.hasApiKey) {
      this.showSettings = true
      this.errorMessage = 'Configure a API key antes de enviar mensagens.'
      return
    }

    const userMessage = this.createMessage('user', event.message)
    this.messages = [...this.messages, userMessage]
    this.sending = true
    this.errorMessage = ''

    try {
      const readonlyContext = event.allowDatabaseContext
        ? this.databaseContext.buildReadonlyContext(this.selectedSchemaDB, this.dbSchemasData, this.tabInfo)
        : undefined
      const response = await this.chatService.sendMessage(this.toApiMessages(), readonlyContext)
      this.messages = [...this.messages, this.createMessage('assistant', response.message)]
    } catch (error: unknown) {
      this.messages = [
        ...this.messages,
        this.createMessage('assistant', this.getErrorMessage(error, 'Não foi possível obter resposta da IA.'), true)
      ]
    } finally {
      this.sending = false
    }
  }

  trackMessage(_index: number, message: AiChatMessage): string {
    return message.id
  }

  private toApiMessages(): AiAssistantApiMessage[] {
    return this.messages
      .filter((message) => !message.error)
      .map((message) => ({
        role: message.role,
        content: message.content
      }))
  }

  private createMessage(role: 'user' | 'assistant', content: string, error: boolean = false): AiChatMessage {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      createdAt: new Date().toISOString(),
      error
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>
      const message = record['message']
      const detail = record['error']

      if (typeof detail === 'string' && detail.trim()) return detail
      if (typeof message === 'string' && message.trim()) return message
    }

    return fallback
  }
}
