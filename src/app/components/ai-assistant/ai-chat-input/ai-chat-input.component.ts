import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AiChatInputSubmit } from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { CheckboxComponent } from '../../elements/checkbox/checkbox.component'

@Component({
  selector: 'app-ai-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, CheckboxComponent],
  templateUrl: './ai-chat-input.component.html',
  styleUrl: './ai-chat-input.component.scss'
})
export class AiChatInputComponent {
  @Input() disabled: boolean = false
  @Input() databaseContextAvailable: boolean = false
  @Output() send = new EventEmitter<AiChatInputSubmit>()

  message: string = ''
  allowDatabaseContext: boolean = true

  constructor(private language: AppLanguageService) { }

  get canSend(): boolean {
    return !this.disabled && this.message.trim().length > 0
  }

  submit(): void {
    const message = this.message.trim()

    if (!message || this.disabled) {
      return
    }

    this.send.emit({
      message,
      allowDatabaseContext: this.databaseContextAvailable
    })

    this.message = ''
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
