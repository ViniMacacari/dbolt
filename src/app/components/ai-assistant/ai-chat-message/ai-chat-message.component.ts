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

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const trimmedLine = line.trim()

      if (!trimmedLine) {
        flushParagraph()
        flushList()
        continue
      }

      const table = this.tryReadMarkdownTable(lines, index)
      if (table) {
        flushParagraph()
        flushList()
        html.push(table.html)
        index = table.nextIndex - 1
        continue
      }

      const heading = trimmedLine.match(/^(#{1,4})\s+(.+)$/)
      if (heading) {
        flushParagraph()
        flushList()
        const level = Math.min(4, heading[1].length + 2)
        html.push(`<h${level}>${this.formatInline(heading[2])}</h${level}>`)
        continue
      }

      if (/^---+$/.test(trimmedLine)) {
        flushParagraph()
        flushList()
        html.push('<hr>')
        continue
      }

      const listItem = trimmedLine.match(/^[-*]\s+(.+)$/)
      if (listItem) {
        flushParagraph()
        listItems.push(`<li>${this.formatInline(listItem[1])}</li>`)
        continue
      }

      flushList()
      paragraph.push(trimmedLine)
    }

    flushParagraph()
    flushList()

    return html.join('')
  }

  private tryReadMarkdownTable(lines: string[], startIndex: number): { html: string, nextIndex: number } | null {
    const header = this.splitMarkdownTableRow(lines[startIndex])
    const separator = this.splitMarkdownTableRow(lines[startIndex + 1] || '')

    if (header.length < 2) return null
    if (!this.isMarkdownTableSeparator(separator)) return null

    const rows: string[][] = []
    let nextIndex = startIndex + 2

    while (nextIndex < lines.length) {
      const row = this.splitMarkdownTableRow(lines[nextIndex])
      if (row.length < 2) break

      rows.push(row)
      nextIndex += 1
    }

    const columnCount = header.length
    const alignments = separator.slice(0, columnCount).map((cell) => this.getMarkdownTableAlignment(cell))
    const cellsFor = (cells: string[]): string[] => Array.from({ length: columnCount }, (_value, index) => cells[index] || '')
    const alignmentClass = (alignment: string): string => alignment === 'left' ? '' : ` class="align-${alignment}"`

    const headHtml = cellsFor(header)
      .map((cell, index) => `<th${alignmentClass(alignments[index])}>${this.formatInline(cell)}</th>`)
      .join('')
    const bodyHtml = rows
      .map((row) => {
        const rowHtml = cellsFor(row)
          .map((cell, index) => `<td${alignmentClass(alignments[index])}>${this.formatInline(cell)}</td>`)
          .join('')
        return `<tr>${rowHtml}</tr>`
      })
      .join('')

    return {
      html: [
        '<div class="md-table-wrapper">',
        '<table class="md-table">',
        `<thead><tr>${headHtml}</tr></thead>`,
        bodyHtml ? `<tbody>${bodyHtml}</tbody>` : '',
        '</table>',
        '</div>'
      ].join(''),
      nextIndex
    }
  }

  private splitMarkdownTableRow(line: string): string[] {
    const trimmedLine = line.trim()
    if (!trimmedLine.includes('|')) return []

    const row = trimmedLine
      .replace(/^\|/, '')
      .replace(/\|$/, '')

    const cells: string[] = []
    let currentCell = ''

    for (let index = 0; index < row.length; index += 1) {
      const character = row[index]
      if (character === '\\' && row[index + 1] === '|') {
        currentCell += '|'
        index += 1
        continue
      }

      if (character === '|') {
        cells.push(currentCell.trim())
        currentCell = ''
        continue
      }

      currentCell += character
    }

    cells.push(currentCell.trim())
    return cells
  }

  private isMarkdownTableSeparator(cells: string[]): boolean {
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
  }

  private getMarkdownTableAlignment(separatorCell: string): 'left' | 'center' | 'right' {
    const cell = separatorCell.replace(/\s/g, '')
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
    if (cell.endsWith(':')) return 'right'
    return 'left'
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
