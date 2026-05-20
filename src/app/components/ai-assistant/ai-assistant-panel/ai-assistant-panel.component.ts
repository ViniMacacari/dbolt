import { CommonModule } from '@angular/common'
import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core'

import { AiChatInputComponent } from '../ai-chat-input/ai-chat-input.component'
import { AiChatMessageComponent } from '../ai-chat-message/ai-chat-message.component'
import { AiSettingsFormComponent } from '../ai-settings-form/ai-settings-form.component'
import { YesNoModalComponent } from '../../modal/yes-no-modal/yes-no-modal.component'
import { AiAssistantChatService } from '../../../services/ai-assistant/ai-assistant-chat.service'
import {
  AiAssistantApiMessage,
  AiAssistantConversation,
  AiAssistantConversationsState,
  AiAssistantSettings,
  AiAssistantSettingsUpdate,
  AiChatInputSubmit,
  AiChatMessage
} from '../../../services/ai-assistant/ai-assistant.model'
import { AiDatabaseContextService } from '../../../services/ai-assistant/ai-database-context.service'
import { AiAssistantSettingsService } from '../../../services/ai-assistant/ai-assistant-settings.service'
import { AiAssistantConversationsService } from '../../../services/ai-assistant/ai-assistant-conversations.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [CommonModule, AiChatInputComponent, AiChatMessageComponent, AiSettingsFormComponent, YesNoModalComponent],
  templateUrl: './ai-assistant-panel.component.html',
  styleUrl: './ai-assistant-panel.component.scss'
})
export class AiAssistantPanelComponent implements OnInit, AfterViewChecked {
  @Input() selectedSchemaDB: unknown
  @Input() dbSchemasData: unknown
  @Input() tabInfo: unknown
  @Output() close = new EventEmitter<void>()

  settings: AiAssistantSettings | null = null
  conversations: AiAssistantConversation[] = []
  activeConversationId: string = ''
  messages: AiChatMessage[] = []
  showSettings: boolean = false
  loadingSettings: boolean = false
  loadingConversations: boolean = false
  savingSettings: boolean = false
  sending: boolean = false
  errorMessage: string = ''
  showDeleteConversationConfirm: boolean = false
  pendingDeleteConversation: AiAssistantConversation | null = null

  @ViewChild('messagesContainer')
  private messagesContainer?: ElementRef<HTMLDivElement>

  @ViewChildren('messageItem')
  private messageItems?: QueryList<ElementRef<HTMLElement>>

  private lastScrolledMessageId: string = ''

  constructor(
    private settingsService: AiAssistantSettingsService,
    private chatService: AiAssistantChatService,
    private conversationsService: AiAssistantConversationsService,
    private databaseContext: AiDatabaseContextService,
    private language: AppLanguageService
  ) { }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadSettings(),
      this.loadConversations()
    ])
  }

  ngAfterViewChecked(): void {
    const lastMessage = this.messages[this.messages.length - 1]

    if (!lastMessage) return
    if (lastMessage.id === this.lastScrolledMessageId) return

    const container = this.messagesContainer?.nativeElement
    const lastElement = this.messageItems?.last?.nativeElement

    if (!container || !lastElement) return

    if (lastMessage.role === 'user') {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      })
    }

    if (lastMessage.role === 'assistant') {
      lastElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }

    this.lastScrolledMessageId = lastMessage.id
  }

  get canChat(): boolean {
    return Boolean(this.settings?.hasApiKey) && !this.loadingSettings
  }

  get databaseContextAvailable(): boolean {
    return this.databaseContext.hasDatabaseContext(this.selectedSchemaDB, this.dbSchemasData)
  }

  get activeConversation(): AiAssistantConversation | null {
    return this.conversations.find((conversation) => conversation.id === this.activeConversationId) || null
  }

  get contextDatabaseLabel(): string {
    const context = this.asRecord(this.selectedSchemaDB)
    return this.readContextValue(context, 'database') || this.t('aiAssistant.noContext')
  }

  get contextSchemaLabel(): string {
    const context = this.asRecord(this.selectedSchemaDB)
    return this.readContextValue(context, 'schema') || this.t('aiAssistant.readonlyUnavailable')
  }

  async loadSettings(): Promise<void> {
    this.loadingSettings = true
    this.errorMessage = ''

    try {
      this.settings = await this.settingsService.loadSettings()
      this.showSettings = !this.settings.hasApiKey
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.loadSettingsError'))
      this.showSettings = true
    } finally {
      this.loadingSettings = false
    }
  }

  async loadConversations(): Promise<void> {
    this.loadingConversations = true

    try {
      this.applyConversationState(await this.conversationsService.loadConversations())
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.loadConversationsError'))
    } finally {
      this.loadingConversations = false
    }
  }

  async saveSettings(update: AiAssistantSettingsUpdate): Promise<void> {
    this.savingSettings = true
    this.errorMessage = ''

    try {
      this.settings = await this.settingsService.saveSettings(update)
      this.showSettings = !this.settings.hasApiKey
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.saveSettingsError'))
    } finally {
      this.savingSettings = false
    }
  }

  async onSend(event: AiChatInputSubmit): Promise<void> {
    if (!this.settings?.hasApiKey) {
      this.showSettings = true
      this.errorMessage = this.t('aiAssistant.apiKeyRequired')
      return
    }

    let conversationId = ''
    try {
      conversationId = await this.ensureActiveConversation()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.saveConversationError'))
      return
    }

    const userMessage = this.createMessage('user', event.message)
    this.messages = [...this.messages, userMessage]
    this.sending = true
    this.errorMessage = ''
    await this.saveConversationMessages(conversationId, this.messages)

    try {
      const readonlyToolContext = event.allowDatabaseContext
        ? this.databaseContext.buildReadonlyToolContext(this.selectedSchemaDB, this.dbSchemasData)
        : undefined
      const response = await this.chatService.sendMessage(this.toApiMessages(), readonlyToolContext)
      this.messages = [...this.messages, this.createMessage('assistant', response.message)]
      await this.saveConversationMessages(conversationId, this.messages)
    } catch (error: unknown) {
      this.messages = [
        ...this.messages,
        this.createMessage('assistant', this.getErrorMessage(error, this.t('aiAssistant.responseError')), true)
      ]
      await this.saveConversationMessages(conversationId, this.messages)
    } finally {
      this.sending = false
    }
  }

  trackMessage(_index: number, message: AiChatMessage): string {
    return message.id
  }

  trackConversation(_index: number, conversation: AiAssistantConversation): string {
    return conversation.id
  }

  async startNewConversation(): Promise<void> {
    if (this.sending || this.loadingConversations) return

    this.loadingConversations = true
    this.errorMessage = ''

    try {
      this.showSettings = false
      this.applyConversationState(await this.conversationsService.createConversation())
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.saveConversationError'))
    } finally {
      this.loadingConversations = false
    }
  }

  async selectConversation(conversation: AiAssistantConversation): Promise<void> {
    if (this.sending || conversation.id === this.activeConversationId) return

    this.loadingConversations = true
    this.errorMessage = ''

    try {
      this.showSettings = false
      this.applyConversationState(await this.conversationsService.setActiveConversation(conversation.id))
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.loadConversationsError'))
    } finally {
      this.loadingConversations = false
    }
  }

  requestDeleteConversation(conversation: AiAssistantConversation, event: MouseEvent): void {
    event.stopPropagation()
    if (this.sending || this.loadingConversations) return

    this.pendingDeleteConversation = conversation
    this.showDeleteConversationConfirm = true
  }

  cancelDeleteConversation(): void {
    this.pendingDeleteConversation = null
    this.showDeleteConversationConfirm = false
  }

  async confirmDeleteConversation(): Promise<void> {
    if (this.sending || this.loadingConversations) return
    if (!this.pendingDeleteConversation) return

    const conversation = this.pendingDeleteConversation
    this.pendingDeleteConversation = null
    this.showDeleteConversationConfirm = false

    this.loadingConversations = true
    this.errorMessage = ''

    try {
      this.applyConversationState(await this.conversationsService.deleteConversation(conversation.id))
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.deleteConversationError'))
    } finally {
      this.loadingConversations = false
    }
  }

  getConversationTitle(conversation: AiAssistantConversation): string {
    if (conversation.messages.length === 0 && conversation.title === 'New chat') {
      return this.t('aiAssistant.newConversation')
    }

    return conversation.title || this.t('aiAssistant.newConversation')
  }

  get deleteConversationConfirmMessage(): string {
    return this.t('aiAssistant.deleteConversationConfirm', {
      title: this.pendingDeleteConversation ? this.getConversationTitle(this.pendingDeleteConversation) : this.t('aiAssistant.newConversation')
    })
  }

  private toApiMessages(): AiAssistantApiMessage[] {
    return this.messages
      .filter((message) => !message.error)
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.content.length > this.getMessagePromptLimit(message.role)
          ? `${message.content.slice(0, this.getMessagePromptLimit(message.role))}...`
          : message.content
      }))
  }

  private getMessagePromptLimit(role: 'user' | 'assistant'): number {
    return role === 'assistant' ? 900 : 1400
  }

  private async ensureActiveConversation(): Promise<string> {
    if (this.activeConversationId) {
      return this.activeConversationId
    }

    const state = await this.conversationsService.createConversation()
    this.applyConversationState(state)
    return state.activeConversationId
  }

  private async saveConversationMessages(conversationId: string, messages: AiChatMessage[]): Promise<void> {
    try {
      this.applyConversationState(await this.conversationsService.saveConversation(conversationId, messages))
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.saveConversationError'))
    }
  }

  private applyConversationState(state: AiAssistantConversationsState): void {
    this.conversations = state.conversations
    this.activeConversationId = state.activeConversationId
    this.messages = this.activeConversation?.messages || []
    this.lastScrolledMessageId = ''
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

  private readContextValue(context: Record<string, unknown>, key: string): string {
    const value = context[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
