import { CommonModule } from '@angular/common'
import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AiChatInputSubmit } from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { ButtonComponent } from '../../elements/button/button.component'
import { CheckboxComponent } from '../../elements/checkbox/checkbox.component'

const TEXTAREA_MAX_HEIGHT = 220
const ADVANCED_ANIMATION_MS = 240

@Component({
  selector: 'app-ai-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, CheckboxComponent],
  templateUrl: './ai-chat-input.component.html',
  styleUrl: './ai-chat-input.component.scss'
})
export class AiChatInputComponent implements OnDestroy {
  @Input() disabled: boolean = false
  @Input() databaseContextAvailable: boolean = false
  @Input() currentSqlAvailable: boolean = false
  @Input() sending: boolean = false
  @Output() send = new EventEmitter<AiChatInputSubmit>()
  @Output() stop = new EventEmitter<void>()
  @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>

  message: string = ''
  allowDatabaseContext: boolean = true
  includeCurrentSql: boolean = false
  autoApplyCurrentSql: boolean = false
  advancedOpen: boolean = false
  advancedAnimating: boolean = false

  private advancedAnimationTimeout?: ReturnType<typeof setTimeout>

  constructor(private language: AppLanguageService) { }

  ngOnDestroy(): void {
    if (this.advancedAnimationTimeout) {
      clearTimeout(this.advancedAnimationTimeout)
    }
  }

  get canSend(): boolean {
    return !this.disabled && this.message.trim().length > 0
  }

  toggleAdvanced(): void {
    this.advancedOpen = !this.advancedOpen
    this.advancedAnimating = true

    if (this.advancedAnimationTimeout) {
      clearTimeout(this.advancedAnimationTimeout)
    }

    this.advancedAnimationTimeout = setTimeout(() => {
      this.advancedAnimating = false
      this.advancedAnimationTimeout = undefined
    }, ADVANCED_ANIMATION_MS)
  }

  submit(): void {
    const message = this.message.trim()

    if (!message || this.disabled) {
      return
    }

    this.send.emit({
      message,
      allowDatabaseContext: this.databaseContextAvailable && this.allowDatabaseContext,
      includeCurrentSql: this.currentSqlAvailable && this.includeCurrentSql,
      autoApplyCurrentSql: this.currentSqlAvailable && this.includeCurrentSql && this.autoApplyCurrentSql
    })

    this.message = ''
    this.resetTextareaHeight(this.messageInput?.nativeElement)
  }

  onTextareaInput(): void {
    this.resizeTextarea(this.messageInput?.nativeElement)
  }

  onTextareaKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) {
      return
    }

    event.stopPropagation()
    event.preventDefault()

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      this.insertLineBreak(event.target as HTMLTextAreaElement | null)
      return
    }

    this.submit()
  }

  private insertLineBreak(textarea: HTMLTextAreaElement | null): void {
    if (!textarea) {
      this.message = `${this.message}\n`
      return
    }

    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length

    textarea.setRangeText('\n', start, end, 'end')
    this.message = textarea.value

    this.resizeTextarea(textarea)
    this.scrollCaretIntoView(textarea)
  }

  private resizeTextarea(textarea: HTMLTextAreaElement | null | undefined): void {
    if (!textarea) {
      return
    }

    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
  }

  private resetTextareaHeight(textarea: HTMLTextAreaElement | null | undefined): void {
    if (!textarea) {
      return
    }

    textarea.style.height = ''
    textarea.style.overflowY = 'hidden'
    textarea.scrollTop = 0
  }

  private scrollCaretIntoView(textarea: HTMLTextAreaElement): void {
    const caret = textarea.selectionStart ?? textarea.value.length

    if (caret >= textarea.value.length) {
      textarea.scrollTop = textarea.scrollHeight
      return
    }

    const lineHeight = this.readLineHeight(textarea)
    const paddingTop = this.readNumericStyle(textarea, 'paddingTop')
    const caretLine = textarea.value.slice(0, caret).split('\n').length - 1
    const caretTop = paddingTop + caretLine * lineHeight
    const visibleHeight = textarea.clientHeight

    if (caretTop + lineHeight > textarea.scrollTop + visibleHeight) {
      textarea.scrollTop = caretTop + lineHeight - visibleHeight
      return
    }

    if (caretTop < textarea.scrollTop) {
      textarea.scrollTop = caretTop
    }
  }

  private readLineHeight(textarea: HTMLTextAreaElement): number {
    const lineHeight = this.readNumericStyle(textarea, 'lineHeight')

    if (lineHeight > 0) {
      return lineHeight
    }

    const fontSize = this.readNumericStyle(textarea, 'fontSize')
    return fontSize > 0 ? fontSize * 1.4 : 18
  }

  private readNumericStyle(element: HTMLElement, property: 'lineHeight' | 'fontSize' | 'paddingTop'): number {
    if (typeof window === 'undefined' || !window.getComputedStyle) {
      return 0
    }

    const value = Number.parseFloat(window.getComputedStyle(element)[property])
    return Number.isFinite(value) ? value : 0
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
