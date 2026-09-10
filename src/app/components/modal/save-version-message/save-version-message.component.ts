import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AppLanguageService } from '../../../services/language/app-language.service'

const CLOSE_ANIMATION_MS = 180

@Component({
  selector: 'app-save-version-message',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './save-version-message.component.html',
  styleUrl: './save-version-message.component.scss'
})
export class SaveVersionMessageComponent {
  @Input() queryName: string = ''
  @Output() confirmed = new EventEmitter<string>()
  @Output() closed = new EventEmitter<void>()

  message: string = ''
  closing: boolean = false

  private closeTimer?: ReturnType<typeof setTimeout>

  constructor(private language: AppLanguageService) { }

  get canConfirm(): boolean {
    return !this.closing && this.message.trim().length > 0
  }

  close(): void {
    if (this.closing) return

    this.closing = true
    this.closeTimer = setTimeout(() => this.closed.emit(), CLOSE_ANIMATION_MS)
  }

  confirm(): void {
    if (!this.canConfirm) return

    const message = this.message.trim()
    this.closing = true
    this.closeTimer = setTimeout(() => this.confirmed.emit(message), CLOSE_ANIMATION_MS)
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      this.close()
      return
    }

    if (event.key !== 'Enter' || event.isComposing) {
      return
    }

    event.stopPropagation()

    if (event.shiftKey) {
      return
    }

    event.preventDefault()
    this.confirm()
  }

  ngOnDestroy(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
    }
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
