import { CommonModule } from '@angular/common'
import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core'

import { AiChatInputComponent } from '../ai-chat-input/ai-chat-input.component'
import { AiChatMessageComponent } from '../ai-chat-message/ai-chat-message.component'
import { YesNoModalComponent } from '../../modal/yes-no-modal/yes-no-modal.component'
import { AiAssistantChatService } from '../../../services/ai-assistant/ai-assistant-chat.service'
import {
  AiAssistantApiMessage,
  AiAssistantConversation,
  AiAssistantConversationsState,
  AiAssistantProgressStage,
  AiAssistantSettings,
  AiChatInputSubmit,
  AiChatMessage,
  AiReadonlyDatabaseToolContext
} from '../../../services/ai-assistant/ai-assistant.model'
import { AiDatabaseContextService } from '../../../services/ai-assistant/ai-database-context.service'
import { AiAssistantSettingsService } from '../../../services/ai-assistant/ai-assistant-settings.service'
import { AiAssistantConversationsService } from '../../../services/ai-assistant/ai-assistant-conversations.service'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { ConnectionContextService } from '../../../services/connection-context/connection-context.service'
import { OpenAiOAuthSessionService } from '../../../services/ai-assistant/openai-oauth-session.service'
import { InputListComponent } from '../../elements/input-list/input-list.component'
import { ButtonComponent } from '../../elements/button/button.component'
import {
  AiAssistantModelOption,
  modelOption,
  staticModelOptionsForProvider
} from '../../../services/ai-assistant/ai-assistant-model-catalog'

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [
    CommonModule,
    AiChatInputComponent,
    AiChatMessageComponent,
    YesNoModalComponent,
    InputListComponent,
    ButtonComponent
  ],
  templateUrl: './ai-assistant-panel.component.html',
  styleUrl: './ai-assistant-panel.component.scss',
  host: {
    '[class.expanded]': 'sidebarExpanded'
  }
})
export class AiAssistantPanelComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Input() selectedSchemaDB: unknown
  @Input() dbSchemasData: unknown
  @Input() tabInfo: unknown
  @Output() close = new EventEmitter<void>()
  @Output() settingsRequested = new EventEmitter<void>()
  @Output() sqlRequested = new EventEmitter<string>()

  settings: AiAssistantSettings | null = null
  conversations: AiAssistantConversation[] = []
  activeConversationId: string = ''
  messages: AiChatMessage[] = []
  loadingSettings: boolean = false
  loadingConversations: boolean = false
  sending: boolean = false
  errorMessage: string = ''
  sidebarExpanded: boolean = false
  showDeleteConversationConfirm: boolean = false
  showDeleteAllConversationsConfirm: boolean = false
  showConversationsModal: boolean = false
  conversationsModalClosing: boolean = false
  pendingDeleteConversation: AiAssistantConversation | null = null
  thinkingSteps: AiAssistantProgressStage[] = []
  thinkingExpanded: boolean = false
  thinkingElapsedSeconds: number = 0
  modelOptions: AiAssistantModelOption[] = []
  modelOptionsLoading: boolean = false
  modelSaving: boolean = false
  modelStatusMessage: string = ''

  @ViewChild('messagesContainer')
  private messagesContainer?: ElementRef<HTMLDivElement>

  private lastScrolledMessageId: string = ''
  private lastScrolledProgressStepCount: number = 0
  private readonly conversationsModalAnimationDuration: number = 180
  private conversationsModalCloseTimer: number | null = null
  private readonlyRuntimeContext: Record<string, unknown> | null = null
  private readonlyRuntimeContextIdentity: string = ''
  private thinkingStartedAt: number = 0
  private thinkingElapsedTimer: number | null = null
  private modelOptionsRequestId: number = 0

  constructor(
    private settingsService: AiAssistantSettingsService,
    private chatService: AiAssistantChatService,
    private conversationsService: AiAssistantConversationsService,
    private databaseContext: AiDatabaseContextService,
    private language: AppLanguageService,
    private connectionContext: ConnectionContextService,
    private openAiOAuth: OpenAiOAuthSessionService
  ) { }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadSettings(),
      this.loadConversations()
    ])
  }

  ngOnDestroy(): void {
    this.cancelConversationsModalClose()
    this.stopThinkingElapsedTimer()
  }

  ngAfterViewChecked(): void {
    const lastMessage = this.messages[this.messages.length - 1]
    const messageChanged = Boolean(lastMessage && lastMessage.id !== this.lastScrolledMessageId)
    const progressChanged = this.sending && this.thinkingSteps.length !== this.lastScrolledProgressStepCount

    if (!messageChanged && !progressChanged) return

    const container = this.messagesContainer?.nativeElement
    if (!container) return

    container.scrollTop = container.scrollHeight

    if (lastMessage) {
      this.lastScrolledMessageId = lastMessage.id
    }
    this.lastScrolledProgressStepCount = this.thinkingSteps.length
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

  get contextSummaryLabel(): string {
    return `${this.contextDatabaseLabel} / ${this.contextSchemaLabel}`
  }

  get activeConversationTitle(): string {
    return this.activeConversation
      ? this.getConversationTitle(this.activeConversation)
      : this.t('aiAssistant.newConversation')
  }

  get currentThinkingStepLabel(): string {
    const currentStep = this.thinkingSteps[this.thinkingSteps.length - 1]
    return currentStep ? this.getThinkingStepLabel(currentStep) : this.t('aiAssistant.answering')
  }

  get visibleThinkingSteps(): AiAssistantProgressStage[] {
    return this.thinkingSteps.slice(-5)
  }

  openSqlInEditor(sql: string): void {
    const normalizedSql = String(sql || '').trim()
    if (!normalizedSql) return

    this.sqlRequested.emit(normalizedSql)
  }

  async loadSettings(): Promise<void> {
    this.loadingSettings = true
    this.errorMessage = ''

    try {
      this.settings = await this.settingsService.loadSettings()
      void this.loadModelOptions(this.settings)
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.loadSettingsError'))
    } finally {
      this.loadingSettings = false
    }
  }

  async onModelSelected(item: { [key: string]: string | number } | null): Promise<void> {
    const model = typeof item?.['value'] === 'string' ? item['value'].trim() : ''
    const currentSettings = this.settings

    if (!currentSettings || !model || model === currentSettings.model || this.sending || this.modelSaving) return
    if (!this.modelOptions.some((option) => option.value === model)) return

    this.modelSaving = true
    this.modelStatusMessage = this.t('aiAssistant.modelChanging')
    this.errorMessage = ''
    this.settings = { ...currentSettings, model }

    try {
      this.settings = await this.settingsService.saveSettings({
        provider: currentSettings.provider,
        model,
        baseUrl: currentSettings.baseUrl || undefined,
        limits: currentSettings.limits
      })
      this.modelStatusMessage = this.t('aiAssistant.modelChanged')
    } catch (error: unknown) {
      this.settings = currentSettings
      this.modelStatusMessage = ''
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.modelChangeFailed'))
    } finally {
      this.modelSaving = false
    }
  }

  private async loadModelOptions(settings: AiAssistantSettings): Promise<void> {
    const requestId = ++this.modelOptionsRequestId
    const currentModelOption = modelOption(settings.model)
    this.modelStatusMessage = ''

    if (settings.provider !== 'openai-oauth' || !settings.openAiOAuthConnected) {
      const options = staticModelOptionsForProvider(settings.provider, settings.model)
      this.modelOptions = options.some((option) => option.value === settings.model)
        ? options
        : [currentModelOption, ...options]
      this.modelOptionsLoading = false
      return
    }

    this.modelOptions = []
    this.modelOptionsLoading = true

    try {
      const models = await this.openAiOAuth.loadModels()
      if (requestId !== this.modelOptionsRequestId) return

      const options = models.map(modelOption)
      this.modelOptions = options
    } catch (error: unknown) {
      if (requestId === this.modelOptionsRequestId) {
        this.errorMessage = this.getErrorMessage(error, this.t('settings.ai.oauth.modelsFailed'))
      }
    } finally {
      if (requestId === this.modelOptionsRequestId) {
        this.modelOptionsLoading = false
      }
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

  async onSend(event: AiChatInputSubmit): Promise<void> {
    if (!this.settings?.hasApiKey) {
      this.errorMessage = this.t('aiAssistant.apiKeyRequired')
      this.settingsRequested.emit()
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
    this.thinkingSteps = ['analyzing-request']
    this.thinkingExpanded = false
    this.startThinkingElapsedTimer()
    this.errorMessage = ''
    await this.saveConversationMessages(conversationId, this.messages)

    try {
      const readonlyToolContext = event.allowDatabaseContext && this.databaseContextAvailable
        ? await this.prepareReadonlyToolContext()
        : undefined
      const response = await this.chatService.sendMessage(
        this.toApiMessages(),
        readonlyToolContext,
        (stage) => this.addThinkingStep(stage)
      )
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
      this.stopThinkingElapsedTimer()
      this.thinkingSteps = []
      this.lastScrolledProgressStepCount = 0
    }
  }

  toggleThinkingProgress(): void {
    this.thinkingExpanded = !this.thinkingExpanded
  }

  getThinkingStepLabel(stage: AiAssistantProgressStage): string {
    return this.t(`aiAssistant.progress.${stage}`)
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
      this.applyConversationState(await this.conversationsService.createConversation())
      this.closeConversationsModal()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.saveConversationError'))
    } finally {
      this.loadingConversations = false
    }
  }

  async selectConversation(conversation: AiAssistantConversation): Promise<void> {
    if (this.sending) return
    if (conversation.id === this.activeConversationId) {
      this.closeConversationsModal()
      return
    }

    this.loadingConversations = true
    this.errorMessage = ''

    try {
      this.applyConversationState(await this.conversationsService.setActiveConversation(conversation.id))
      this.closeConversationsModal()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.loadConversationsError'))
    } finally {
      this.loadingConversations = false
    }
  }

  toggleSidebarWidth(): void {
    this.sidebarExpanded = !this.sidebarExpanded
  }

  openConversationsModal(): void {
    if (this.loadingConversations) return

    this.cancelConversationsModalClose()
    this.conversationsModalClosing = false
    this.showConversationsModal = true
  }

  closeConversationsModal(): void {
    if (!this.showConversationsModal || this.conversationsModalClosing) return

    this.conversationsModalClosing = true
    this.conversationsModalCloseTimer = window.setTimeout(() => {
      this.showConversationsModal = false
      this.conversationsModalClosing = false
      this.conversationsModalCloseTimer = null
    }, this.conversationsModalAnimationDuration)
  }

  @HostListener('document:keydown.escape')
  closeConversationOverlaysOnEscape(): void {
    if (this.showDeleteConversationConfirm) {
      this.cancelDeleteConversation()
      return
    }

    if (this.showDeleteAllConversationsConfirm) {
      this.cancelDeleteAllConversations()
      return
    }

    this.closeConversationsModal()
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

  requestDeleteAllConversations(): void {
    if (this.sending || this.loadingConversations) return

    this.showDeleteAllConversationsConfirm = true
  }

  cancelDeleteAllConversations(): void {
    this.showDeleteAllConversationsConfirm = false
  }

  async confirmDeleteAllConversations(): Promise<void> {
    if (this.sending || this.loadingConversations) return

    this.showDeleteAllConversationsConfirm = false
    this.loadingConversations = true
    this.errorMessage = ''

    try {
      this.applyConversationState(await this.conversationsService.deleteAllConversations())
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('aiAssistant.deleteAllConversationsError'))
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
      .slice(-this.getMaxContextMessages())
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

  private getMaxContextMessages(): number {
    const value = Number(this.settings?.limits?.maxContextMessages || 10)

    if (!Number.isFinite(value)) {
      return 10
    }

    return Math.min(Math.max(Math.floor(value), 1), 20)
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

  private addThinkingStep(stage: AiAssistantProgressStage): void {
    if (!this.sending) return
    if (this.thinkingSteps[this.thinkingSteps.length - 1] === stage) return

    this.thinkingSteps = [
      ...this.thinkingSteps.filter((existingStage) => existingStage !== stage),
      stage
    ].slice(-5)
  }

  private startThinkingElapsedTimer(): void {
    this.stopThinkingElapsedTimer()
    this.thinkingStartedAt = Date.now()
    this.thinkingElapsedSeconds = 0
    this.thinkingElapsedTimer = window.setInterval(() => {
      this.thinkingElapsedSeconds = Math.floor((Date.now() - this.thinkingStartedAt) / 1000)
    }, 1000)
  }

  private stopThinkingElapsedTimer(): void {
    if (this.thinkingElapsedTimer !== null) {
      window.clearInterval(this.thinkingElapsedTimer)
      this.thinkingElapsedTimer = null
    }

    this.thinkingStartedAt = 0
    this.thinkingElapsedSeconds = 0
  }

  private async prepareReadonlyToolContext(): Promise<AiReadonlyDatabaseToolContext> {
    const sourceContext = this.databaseContext.buildRuntimeConnectionContext(
      this.selectedSchemaDB,
      this.dbSchemasData,
      this.tabInfo
    )
    const identity = [
      sourceContext['connId'],
      sourceContext['name'],
      sourceContext['host'],
      sourceContext['port'],
      sourceContext['sgbd'],
      sourceContext['database'],
      sourceContext['schema']
    ].map((value) => String(value || '')).join(':')
    const reusableConnectionKey = identity === this.readonlyRuntimeContextIdentity
      ? this.readonlyRuntimeContext?.['connectionKey']
      : undefined
    const context = this.connectionContext.createContext({
      ...sourceContext,
      connectionKey: sourceContext['connectionKey'] || reusableConnectionKey
    })
    const connectedContext = await this.connectionContext.ensureContext(context)

    this.readonlyRuntimeContextIdentity = identity
    this.readonlyRuntimeContext = connectedContext

    return this.databaseContext.buildReadonlyToolContext(
      connectedContext,
      this.dbSchemasData,
      this.tabInfo
    )
  }

  private cancelConversationsModalClose(): void {
    if (this.conversationsModalCloseTimer === null) return

    window.clearTimeout(this.conversationsModalCloseTimer)
    this.conversationsModalCloseTimer = null
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
