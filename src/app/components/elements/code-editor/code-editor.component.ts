import { Component, Input, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

@Component({
  selector: 'app-code-editor',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.scss'
})
export class CodeEditorComponent {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()

  handleKeyDown(event: KeyboardEvent): void {
    const textarea = event.target as HTMLTextAreaElement
    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    if ((event.ctrlKey && event.key === 'Enter') || event.key === 'F5') {
      event.preventDefault()
      const selectedText = start !== end
        ? textarea.value.substring(start, end)
        : this.getCurrentLineContent(textarea.value, start)
      this.runSql(selectedText)
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const tab = '\t'
      textarea.value = textarea.value.substring(0, start) + tab + textarea.value.substring(end)
      textarea.selectionStart = textarea.selectionEnd = start + tab.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const currentLine = this.getCurrentLine(textarea.value, start)
      const indentation = currentLine.match(/^\s*/)?.[0] || ''
      const newPosition = start + indentation.length + 1
      textarea.value =
        textarea.value.substring(0, start) + '\n' + indentation + textarea.value.substring(end)
      textarea.selectionStart = textarea.selectionEnd = newPosition
    }
  }

  private getCurrentLineContent(text: string, position: number): string {
    const lines = text.split('\n')
    let currentLineIndex = 0
    let cursorPosition = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (cursorPosition <= position && cursorPosition + line.length >= position) {
        currentLineIndex = i
        break
      }
      cursorPosition += line.length + 1
    }

    let startLine = currentLineIndex
    let endLine = currentLineIndex

    while (startLine > 0 && lines[startLine - 1].trim() !== '' && !lines[startLine - 1].trim().endsWith(';')) {
      startLine--
    }

    while (endLine < lines.length - 1 && lines[endLine + 1].trim() !== '' && !lines[endLine].trim().endsWith(';')) {
      endLine++
    }

    return lines.slice(startLine, endLine + 1).join('\n').trim()
  }

  private getCurrentLine(text: string, position: number): string {
    const lines = text.substring(0, position).split('\n')
    return lines[lines.length - 1]
  }

  onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement
    this.sqlContent = textarea.value
    this.sqlContentChange.emit(this.sqlContent)
  }

  runSql(sql: string): void {
    console.log(sql, 'ADWD')
  }
}
