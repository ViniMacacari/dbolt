import { CommonModule } from '@angular/common'
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'

import { AiChatMessage } from '../../../services/ai-assistant/ai-assistant.model'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { QueryResultExportService } from '../../../services/query-result-export/query-result-export.service'

@Component({
  selector: 'app-ai-chat-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-chat-message.component.html',
  styleUrl: './ai-chat-message.component.scss'
})
export class AiChatMessageComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) message!: AiChatMessage

  formattedContent!: SafeHtml

  copyState: 'idle' | 'copied' | 'error' = 'idle'
  private copyResetTimer?: ReturnType<typeof setTimeout>

  constructor(
    private language: AppLanguageService,
    private sanitizer: DomSanitizer,
    private clipboard: QueryResultExportService
  ) { }

  ngOnChanges(_changes: SimpleChanges): void {
    this.formattedContent = this.sanitizer.bypassSecurityTrustHtml(
      this.formatMarkdown(this.message.content || '')
    )
  }

  get authorLabel(): string {
    return this.message.role === 'assistant'
      ? this.language.translate('aiAssistant.assistant')
      : this.language.translate('aiAssistant.user')
  }

  get copyLabel(): string {
    if (this.copyState === 'copied') return this.language.translate('aiAssistant.copied')
    if (this.copyState === 'error') return this.language.translate('aiAssistant.copyFailed')

    return this.language.translate('aiAssistant.copyAnswer')
  }

  async copyMessage(event: MouseEvent): Promise<void> {
    event.stopPropagation()
    this.clearCopyResetTimer()

    try {
      await this.clipboard.copyText(this.message.content || '')
      this.copyState = 'copied'
    } catch (_error: unknown) {
      this.copyState = 'error'
    }

    this.copyResetTimer = setTimeout(() => {
      this.copyState = 'idle'
    }, 1600)
  }

  ngOnDestroy(): void {
    this.clearCopyResetTimer()
  }

  private formatMarkdown(content: string): string {
    const normalizedContent = content.replace(/\r\n/g, '\n')
    const blocks = normalizedContent.split(/(```[\s\S]*?```)/g)

    return blocks
      .map((block) => block.startsWith('```') ? this.formatCodeBlock(block) : this.formatTextBlock(block))
      .join('')
  }

  private formatCodeBlock(block: string): string {
    const match = block.match(/^```([A-Za-z0-9_-]*)\n?([\s\S]*?)```$/)
    const language = this.escapeHtml(match?.[1] || '')
    const code = this.escapeHtml(match?.[2] || block.replace(/^```|```$/g, ''))

    return [
      '<div class="md-code-block">',
      language ? `<span class="md-code-language">${language}</span>` : '',
      `<pre><code>${code}</code></pre>`,
      '</div>'
    ].join('')
  }

  private formatTextBlock(block: string): string {
    const lines = block.split('\n')
    const html: string[] = []
    let paragraph: string[] = []
    let listItems: string[] = []

    const flushParagraph = (): void => {
      if (paragraph.length === 0) return
      html.push(`<p>${this.formatInline(paragraph.join(' '))}</p>`)
      paragraph = []
    }

    const flushList = (): void => {
      if (listItems.length === 0) return
      html.push(`<ul>${listItems.join('')}</ul>`)
      listItems = []
    }

    lines.forEach((line) => {
      const trimmedLine = line.trim()

      if (!trimmedLine) {
        flushParagraph()
        flushList()
        return
      }

      const heading = trimmedLine.match(/^(#{1,4})\s+(.+)$/)
      if (heading) {
        flushParagraph()
        flushList()
        const level = Math.min(4, heading[1].length + 2)
        html.push(`<h${level}>${this.formatInline(heading[2])}</h${level}>`)
        return
      }

      if (/^---+$/.test(trimmedLine)) {
        flushParagraph()
        flushList()
        html.push('<hr>')
        return
      }

      const listItem = trimmedLine.match(/^[-*]\s+(.+)$/)
      if (listItem) {
        flushParagraph()
        listItems.push(`<li>${this.formatInline(listItem[1])}</li>`)
        return
      }

      flushList()
      paragraph.push(trimmedLine)
    })

    flushParagraph()
    flushList()

    return html.join('')
  }

  private formatInline(value: string): string {
    let formatted = this.escapeHtml(value)
    const inlineCode: string[] = []

    formatted = formatted.replace(/`([^`]+)`/g, (_match, code) => {
      inlineCode.push(`<code>${code}</code>`)
      return `@@CODE_${inlineCode.length - 1}@@`
    })

    formatted = formatted
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')

    inlineCode.forEach((code, index) => {
      formatted = formatted.replace(`@@CODE_${index}@@`, code)
    })

    return formatted
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  private clearCopyResetTimer(): void {
    if (!this.copyResetTimer) return

    clearTimeout(this.copyResetTimer)
    this.copyResetTimer = undefined
  }
}
