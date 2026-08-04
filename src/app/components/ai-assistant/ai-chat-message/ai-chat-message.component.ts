import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'

import { AiChatMessage } from '../../../services/ai-assistant/ai-assistant.model'
import { sanitizeAiAssistantContent } from '../../../services/ai-assistant/ai-assistant-content-sanitizer'
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
  @Output() sqlRequested = new EventEmitter<string>()

  formattedContent!: SafeHtml
  private displayContent: string = ''
  private sqlCodeBlocks: string[] = []
  private sqlCopyStates = new Map<number, 'copied' | 'error'>()
  private sqlCopyResetTimers = new Map<number, ReturnType<typeof setTimeout>>()

  copyState: 'idle' | 'copied' | 'error' = 'idle'
  private copyResetTimer?: ReturnType<typeof setTimeout>

  constructor(
    private language: AppLanguageService,
    private sanitizer: DomSanitizer,
    private clipboard: QueryResultExportService
  ) { }

  ngOnChanges(_changes: SimpleChanges): void {
    this.clearSqlCopyResetTimers()
    this.sqlCopyStates.clear()
    this.displayContent = this.message.role === 'assistant'
      ? sanitizeAiAssistantContent(this.message.content || '', this.language.getCurrentLanguage())
      : this.message.content || ''
    this.renderFormattedContent()
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
      await this.clipboard.copyText(this.displayContent)
      this.copyState = 'copied'
    } catch (_error: unknown) {
      this.copyState = 'error'
    }

    this.copyResetTimer = setTimeout(() => {
      this.copyState = 'idle'
    }, 1600)
  }

  async onFormattedContentClick(event: MouseEvent): Promise<void> {
    const target = event.target
    if (!(target instanceof Element)) return

    const actionButton = target.closest<HTMLButtonElement>('button[data-ai-code-action]')
    if (!actionButton) return

    const codeIndex = Number(actionButton.getAttribute('data-ai-code-index'))
    const sql = this.sqlCodeBlocks[codeIndex]
    if (!Number.isInteger(codeIndex) || !sql) return

    event.preventDefault()
    event.stopPropagation()

    if (actionButton.getAttribute('data-ai-code-action') === 'open-sql') {
      this.sqlRequested.emit(sql)
      return
    }

    await this.copySqlCode(sql, codeIndex)
  }

  ngOnDestroy(): void {
    this.clearCopyResetTimer()
    this.clearSqlCopyResetTimers()
  }

  private renderFormattedContent(): void {
    this.sqlCodeBlocks = []
    this.formattedContent = this.sanitizer.bypassSecurityTrustHtml(
      this.formatMarkdown(this.displayContent)
    )
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
    const rawLanguage = match?.[1] || ''
    const rawCode = (match?.[2] || block.replace(/^```|```$/g, '')).replace(/\n$/, '')
    const language = this.escapeHtml(rawLanguage)
    const code = this.escapeHtml(rawCode)
    const sqlCodeIndex = this.message.role === 'assistant' && this.isSqlCodeBlock(rawLanguage, rawCode)
      ? this.sqlCodeBlocks.push(rawCode) - 1
      : -1
    const header = language || sqlCodeIndex >= 0
      ? [
        '<div class="md-code-header">',
        language ? `<span class="md-code-language">${language}</span>` : '<span></span>',
        sqlCodeIndex >= 0 ? this.formatSqlCodeActions(sqlCodeIndex) : '',
        '</div>'
      ].join('')
      : ''

    return [
      '<div class="md-code-block">',
      header,
      `<pre><code>${code}</code></pre>`,
      '</div>'
    ].join('')
  }

  private formatSqlCodeActions(codeIndex: number): string {
    const copyState = this.sqlCopyStates.get(codeIndex)
    const copyLabel = copyState === 'copied'
      ? this.language.translate('aiAssistant.copied')
      : copyState === 'error'
        ? this.language.translate('aiAssistant.copyFailed')
        : this.language.translate('aiAssistant.copySql')
    const openLabel = this.language.translate('aiAssistant.openSqlInNewTab')
    const stateClass = copyState ? ` ${copyState}` : ''

    return [
      '<span class="md-code-actions">',
      `<button type="button" class="md-code-action${stateClass}" data-ai-code-action="copy-sql" data-ai-code-index="${codeIndex}" title="${this.escapeHtml(copyLabel)}" aria-label="${this.escapeHtml(copyLabel)}">`,
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>',
      '</button>',
      `<button type="button" class="md-code-action" data-ai-code-action="open-sql" data-ai-code-index="${codeIndex}" title="${this.escapeHtml(openLabel)}" aria-label="${this.escapeHtml(openLabel)}">`,
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="m20 4-9 9"></path><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"></path></svg>',
      '</button>',
      '</span>'
    ].join('')
  }

  private isSqlCodeBlock(language: string, code: string): boolean {
    const normalizedLanguage = language.trim().toLowerCase()
    const sqlLanguages = new Set([
      'sql',
      'mysql',
      'postgres',
      'postgresql',
      'pgsql',
      'sqlite',
      'tsql',
      'mssql',
      'sqlserver',
      'hana'
    ])

    if (sqlLanguages.has(normalizedLanguage)) return true
    if (normalizedLanguage) return false

    const withoutLeadingComments = code
      .replace(/^\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)*/i, '')

    return /^(?:SELECT|WITH|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXPLAIN|SHOW|DESCRIBE|USE|CALL|EXEC|GRANT|REVOKE)\b/i
      .test(withoutLeadingComments)
  }

  private async copySqlCode(sql: string, codeIndex: number): Promise<void> {
    const currentTimer = this.sqlCopyResetTimers.get(codeIndex)
    if (currentTimer) clearTimeout(currentTimer)

    try {
      await this.clipboard.copyText(sql)
      this.sqlCopyStates.set(codeIndex, 'copied')
    } catch (_error: unknown) {
      this.sqlCopyStates.set(codeIndex, 'error')
    }

    this.renderFormattedContent()

    const timer = setTimeout(() => {
      this.sqlCopyStates.delete(codeIndex)
      this.sqlCopyResetTimers.delete(codeIndex)
      this.renderFormattedContent()
    }, 1600)
    this.sqlCopyResetTimers.set(codeIndex, timer)
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

  private clearSqlCopyResetTimers(): void {
    this.sqlCopyResetTimers.forEach((timer) => clearTimeout(timer))
    this.sqlCopyResetTimers.clear()
  }
}
