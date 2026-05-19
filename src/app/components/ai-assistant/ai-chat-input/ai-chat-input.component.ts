import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AiChatInputSubmit } from '../../../services/ai-assistant/ai-assistant.model'

@Component({
  selector: 'app-ai-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-chat-input.component.html',
  styleUrl: './ai-chat-input.component.scss'
})
export class AiChatInputComponent {
  @Input() disabled: boolean = false
  @Input() databaseContextAvailable: boolean = false
  @Output() send = new EventEmitter<AiChatInputSubmit>()

  message: string = ''
  allowDatabaseContext: boolean = false

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
      allowDatabaseContext: this.allowDatabaseContext && this.databaseContextAvailable
    })

    this.message = ''
  }
}
