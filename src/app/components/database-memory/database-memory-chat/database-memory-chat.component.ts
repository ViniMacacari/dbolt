import { CommonModule } from '@angular/common'
import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AppLanguageService } from '../../../services/language/app-language.service'
import { ButtonComponent } from '../../elements/button/button.component'
import { DatabaseMemoryService } from '../../../services/database-memory/database-memory.service'
import {
  DatabaseMemoryInterviewMode,
  DatabaseMemoryNote,
  DatabaseMemoryProposedNote,
  DatabaseMemoryScope,
  DatabaseMemoryTurn
} from '../../../services/database-memory/database-memory.model'

const EXIT_ANIMATION_MS = 300
const CLOSE_ANIMATION_MS = 280
const POPUP_ANIMATION_MS = 250
const COMPOSER_MAX_HEIGHT = 180

@Component({
  selector: 'app-database-memory-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './database-memory-chat.component.html',
  styleUrl: './database-memory-chat.component.scss'
})
export class DatabaseMemoryChatComponent implements OnInit, OnDestroy {
  @Input() scope: DatabaseMemoryScope = {}
  @Input() readonlyContext: unknown = undefined
  @Input() contextError: string = ''
  @Output() closed = new EventEmitter<void>()

  notes: DatabaseMemoryNote[] = []
  turns: DatabaseMemoryTurn[] = []
  proposedNotes: DatabaseMemoryProposedNote[] = []
  inspectedTables: string[] = []
  executedQueries: string[] = []
  questions: string[] = []
  selectedQuestion: string = ''
  editingProposal: DatabaseMemoryProposedNote | null = null
  editProposalTopic: string = ''
  editProposalText: string = ''
  proposalPopupClosing: boolean = false
  instruction: string = ''
  instructionPopupOpen: boolean = false
  instructionPopupClosing: boolean = false
  answer: string = ''
  ownNoteTopic: string = ''
  ownNoteText: string = ''
  storageFolder: string = ''
  loading: boolean = false
  running: boolean = false
  errorMessage: string = ''
  editingNoteId: string = ''
  editingDraft: string = ''
  closing: boolean = false
  notesPopupOpen: boolean = false
  notesPopupClosing: boolean = false
  addPopupOpen: boolean = false
  addPopupClosing: boolean = false
  removingProposals = new Set<DatabaseMemoryProposedNote>()
  removingNotes = new Set<string>()
  savedNoteIds = new Set<string>()

  @ViewChild('chatScroll') chatScroll?: ElementRef<HTMLDivElement>
  @ViewChild('answerInput') answerInput?: ElementRef<HTMLTextAreaElement>

  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(
    private databaseMemory: DatabaseMemoryService,
    private language: AppLanguageService
  ) { }

  async ngOnInit(): Promise<void> {
    this.loading = true

    try {
      const [record, folder] = await Promise.all([
        this.databaseMemory.load(this.scope),
        this.databaseMemory.getStorageFolder().catch(() => '')
      ])
      this.notes = record.notes
      this.storageFolder = folder
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
    } finally {
      this.loading = false
    }
  }

  ngOnDestroy(): void {
    for (const timer of this.timers) {
      clearTimeout(timer)
    }

    this.timers = []
  }

  get scopeLabel(): string {
    return this.databaseMemory.describeScope(this.scope)
  }

  get hasDatabaseAccess(): boolean {
    return Boolean(this.readonlyContext)
  }

  get canRunInterview(): boolean {
    return !this.running && !this.loading
  }

  get canSubmitAnswer(): boolean {
    return this.canRunInterview && this.answer.trim().length > 0
  }

  get canSubmitInstruction(): boolean {
    return this.canRunInterview && this.instruction.trim().length > 0
  }

  get canSaveOwnNote(): boolean {
    return !this.running && this.ownNoteText.trim().length > 0
  }

  get hasStarted(): boolean {
    return this.turns.length > 0
  }

  get investigationLabel(): string {
    const parts: string[] = []

    if (this.inspectedTables.length) {
      parts.push(this.t('databaseMemory.inspectedTables', { tables: this.inspectedTables.join(', ') }))
    }

    if (this.executedQueries.length) {
      parts.push(this.t('databaseMemory.executedQueries', { count: this.executedQueries.length }))
    }

    return parts.join(' · ')
  }

  openNotesPopup(): void {
    this.notesPopupClosing = false
    this.notesPopupOpen = true
  }

  closeNotesPopup(): void {
    if (!this.notesPopupOpen || this.notesPopupClosing) return

    this.notesPopupClosing = true
    this.schedule(() => {
      this.notesPopupOpen = false
      this.notesPopupClosing = false
      this.cancelEditNote()
    }, POPUP_ANIMATION_MS)
  }

  openInstructionPopup(): void {
    this.instructionPopupClosing = false
    this.instructionPopupOpen = true
  }

  closeInstructionPopup(): void {
    if (!this.instructionPopupOpen || this.instructionPopupClosing) return

    this.instructionPopupClosing = true
    this.schedule(() => {
      this.instructionPopupOpen = false
      this.instructionPopupClosing = false
    }, POPUP_ANIMATION_MS)
  }

  async submitInstruction(): Promise<void> {
    if (!this.canSubmitInstruction) return

    const instruction = this.instruction.trim()
    this.instruction = ''
    this.closeInstructionPopup()
    await this.runInterview([{ role: 'user', content: instruction }], 'instruct')
  }

  answerQuestion(question: string): void {
    this.selectedQuestion = question
    this.schedule(() => {
      const textarea = this.answerInput?.nativeElement

      if (textarea) {
        textarea.focus()
        this.resizeComposer()
      }
    }, 0)
  }

  clearSelectedQuestion(): void {
    this.selectedQuestion = ''
  }

  isQuestionSelected(question: string): boolean {
    return this.selectedQuestion === question
  }

  startEditProposal(note: DatabaseMemoryProposedNote): void {
    if (this.running) return

    this.editingProposal = note
    this.editProposalTopic = note.topic
    this.editProposalText = note.text
    this.proposalPopupClosing = false
  }

  cancelEditProposal(): void {
    if (!this.editingProposal || this.proposalPopupClosing) return

    this.proposalPopupClosing = true
    this.schedule(() => {
      this.editingProposal = null
      this.editProposalTopic = ''
      this.editProposalText = ''
      this.proposalPopupClosing = false
    }, POPUP_ANIMATION_MS)
  }

  get canConfirmEditProposal(): boolean {
    return !this.running && this.editProposalText.trim().length > 0
  }

  async confirmEditProposal(): Promise<void> {
    const original = this.editingProposal

    if (!original || !this.canConfirmEditProposal) return

    const edited = {
      topic: this.editProposalTopic.trim() || original.topic,
      text: this.editProposalText.trim()
    }

    try {
      const record = await this.databaseMemory.addNotes(this.scope, [edited], 'user')
      this.applyRecordNotes(record.notes)
      this.cancelEditProposal()
      this.proposedNotes = this.proposedNotes.filter((item) => item !== original)
      this.removingProposals.delete(original)
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
    }
  }

  openAddPopup(): void {
    this.addPopupClosing = false
    this.addPopupOpen = true
  }

  closeAddPopup(): void {
    if (!this.addPopupOpen || this.addPopupClosing) return

    this.addPopupClosing = true
    this.schedule(() => {
      this.addPopupOpen = false
      this.addPopupClosing = false
    }, POPUP_ANIMATION_MS)
  }

  onAnswerInput(): void {
    this.resizeComposer()
  }

  onAnswerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) {
      return
    }

    event.stopPropagation()

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      return
    }

    event.preventDefault()
    void this.submitAnswer()
  }

  close(): void {
    if (this.closing) return

    this.closing = true
    this.schedule(() => this.closed.emit(), CLOSE_ANIMATION_MS)
  }

  async startInterview(): Promise<void> {
    if (!this.canRunInterview) return
    await this.runInterview([], 'investigate')
  }

  async submitAnswer(): Promise<void> {
    if (!this.canSubmitAnswer) return

    const answer = this.answer.trim()
    const question = this.selectedQuestion.trim()
    const content = question
      ? `${this.t('databaseMemory.questionPrefix')} ${question}
${this.t('databaseMemory.answerPrefix')} ${answer}`
      : answer

    this.answer = ''
    this.selectedQuestion = ''
    this.resetComposer()
    await this.runInterview([{ role: 'user', content }], 'investigate')
  }

  async acceptProposedNote(note: DatabaseMemoryProposedNote, event?: Event): Promise<void> {
    if (this.running || this.removingProposals.has(note)) return

    const slot = this.readSlot(event)

    try {
      const record = await this.databaseMemory.addNotes(this.scope, [note], 'ai')
      this.applyRecordNotes(record.notes)
      this.animateProposalOut(note, slot)
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
    }
  }

  async acceptAllProposedNotes(): Promise<void> {
    if (this.running || this.proposedNotes.length === 0) return

    const accepted = [...this.proposedNotes]

    try {
      const record = await this.databaseMemory.addNotes(this.scope, accepted, 'ai')
      this.applyRecordNotes(record.notes)

      for (const note of accepted) {
        this.removingProposals.add(note)
      }

      this.schedule(() => {
        this.proposedNotes = []
        this.removingProposals.clear()
      }, EXIT_ANIMATION_MS)
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
    }
  }

  discardProposedNote(note: DatabaseMemoryProposedNote, event?: Event): void {
    if (this.removingProposals.has(note)) return
    this.animateProposalOut(note, this.readSlot(event))
  }

  async saveOwnNote(): Promise<void> {
    if (!this.canSaveOwnNote) return

    try {
      const record = await this.databaseMemory.addNotes(this.scope, [{
        topic: this.ownNoteTopic.trim(),
        text: this.ownNoteText.trim()
      }], 'user')
      this.applyRecordNotes(record.notes)
      this.ownNoteTopic = ''
      this.ownNoteText = ''
      this.closeAddPopup()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
    }
  }

  startEditNote(note: DatabaseMemoryNote): void {
    this.editingNoteId = note.id
    this.editingDraft = note.text
  }

  cancelEditNote(): void {
    this.editingNoteId = ''
    this.editingDraft = ''
  }

  async confirmEditNote(note: DatabaseMemoryNote): Promise<void> {
    const text = this.editingDraft.trim()

    if (!text || text === note.text) {
      this.cancelEditNote()
      return
    }

    try {
      const record = await this.databaseMemory.updateNote(this.scope, note.id, { text })
      this.notes = record.notes
      this.cancelEditNote()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
    }
  }

  async deleteNote(note: DatabaseMemoryNote, event?: Event): Promise<void> {
    if (this.running || this.removingNotes.has(note.id)) return

    const slot = this.readSlot(event)
    this.removingNotes.add(note.id)

    try {
      const record = await this.databaseMemory.deleteNote(this.scope, note.id)
      this.collapseSlot(slot, () => {
        this.notes = record.notes
        this.removingNotes.delete(note.id)
      })
    } catch (error: unknown) {
      this.removingNotes.delete(note.id)
      this.errorMessage = this.getErrorMessage(error)
    }
  }

  isProposalRemoving(note: DatabaseMemoryProposedNote): boolean {
    return this.removingProposals.has(note)
  }

  isNoteRemoving(note: DatabaseMemoryNote): boolean {
    return this.removingNotes.has(note.id)
  }

  isNoteNew(note: DatabaseMemoryNote): boolean {
    return this.savedNoteIds.has(note.id)
  }

  trackNote(_index: number, note: DatabaseMemoryNote): string {
    return note.id
  }

  trackTurn(index: number): number {
    return index
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private applyRecordNotes(notes: DatabaseMemoryNote[]): void {
    const previous = new Set(this.notes.map((note) => note.id))
    const added = notes.filter((note) => !previous.has(note.id)).map((note) => note.id)

    this.notes = notes

    if (added.length === 0) {
      return
    }

    for (const id of added) {
      this.savedNoteIds.add(id)
    }

    this.schedule(() => {
      for (const id of added) {
        this.savedNoteIds.delete(id)
      }
    }, 1200)
  }

  private mergeProposals(incoming: DatabaseMemoryProposedNote[]): DatabaseMemoryProposedNote[] {
    const known = new Set([
      ...this.proposedNotes.map((note) => this.dedupeKey(note.text)),
      ...this.notes.map((note) => this.dedupeKey(note.text))
    ])
    const merged = [...this.proposedNotes]

    for (const note of incoming || []) {
      const key = this.dedupeKey(note.text)

      if (!key || known.has(key)) {
        continue
      }

      known.add(key)
      merged.push(note)
    }

    return merged
  }

  private dedupeKey(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  private animateProposalOut(note: DatabaseMemoryProposedNote, slot?: HTMLElement | null): void {
    this.removingProposals.add(note)
    this.collapseSlot(slot, () => {
      this.proposedNotes = this.proposedNotes.filter((item) => item !== note)
      this.removingProposals.delete(note)
    })
  }

  private readSlot(event?: Event): HTMLElement | null {
    const target = (event?.currentTarget || event?.target) as HTMLElement | null
    return (target?.closest('.memory-slot') as HTMLElement | null) || null
  }

  private collapseSlot(slot: HTMLElement | null | undefined, done: () => void): void {
    if (!slot) {
      done()
      return
    }

    slot.style.height = `${slot.offsetHeight}px`
    slot.style.overflow = 'hidden'
    void slot.offsetHeight
    slot.classList.add('removing')
    slot.style.height = '0px'
    this.schedule(done, EXIT_ANIMATION_MS)
  }

  private async runInterview(
    newTurns: DatabaseMemoryTurn[],
    mode: DatabaseMemoryInterviewMode
  ): Promise<void> {
    this.running = true
    this.errorMessage = ''
    this.questions = []
    const turns = [...this.turns, ...newTurns]
    this.turns = turns
    this.scrollToLatest()

    try {
      const result = await this.databaseMemory.runInterview(this.scope, turns, this.readonlyContext, mode)
      const reply = (result.message || '').trim()

      this.proposedNotes = this.mergeProposals(result.proposedNotes)
      this.questions = result.questions || []
      this.inspectedTables = result.inspectedTables || []
      this.executedQueries = result.executedQueries || []

      if (reply) {
        this.turns = [...turns, { role: 'assistant', content: reply }]
      }

      this.scrollToLatest()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error)
      this.turns = turns
    } finally {
      this.running = false
    }
  }

  private resizeComposer(): void {
    const textarea = this.answerInput?.nativeElement

    if (!textarea) {
      return
    }

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }

  private resetComposer(): void {
    const textarea = this.answerInput?.nativeElement

    if (textarea) {
      textarea.style.height = ''
      textarea.style.overflowY = 'hidden'
    }
  }

  private scrollToLatest(): void {
    this.schedule(() => {
      const container = this.chatScroll?.nativeElement

      if (container) {
        container.scrollTop = container.scrollHeight
      }
    }, 0)
  }

  private schedule(action: () => void, delay: number): void {
    this.timers.push(setTimeout(() => action(), delay))
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message
    }

    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>
      const detail = record['error']
      const message = record['message']

      if (typeof detail === 'string' && detail.trim()) return detail
      if (typeof message === 'string' && message.trim()) return message
    }

    return this.t('databaseMemory.error')
  }
}
