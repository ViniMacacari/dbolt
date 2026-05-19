import { CommonModule } from '@angular/common'
import { Component, Input } from '@angular/core'

import { AiChatMessage } from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-ai-chat-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-chat-message.component.html',
  styleUrl: './ai-chat-message.component.scss'
})
export class AiChatMessageComponent {
  @Input({ required: true }) message!: AiChatMessage

  constructor(private language: AppLanguageService) { }

  get authorLabel(): string {
    return this.message.role === 'assistant'
      ? this.language.translate('aiAssistant.assistant')
      : this.language.translate('aiAssistant.user')
  }
}
