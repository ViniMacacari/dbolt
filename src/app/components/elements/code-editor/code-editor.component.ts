import { Component, Input, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ContenteditableModelDirective } from './contenteditable-model.directive'

@Component({
  selector: 'app-code-editor',
  standalone: true,
  imports: [FormsModule, CommonModule, ContenteditableModelDirective],
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.scss'
})
export class CodeEditorComponent {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()

  handleKeyDown(event: KeyboardEvent): void {
    const div = event.target as HTMLDivElement
    const selection = window.getSelection()
    const range = selection?.getRangeAt(0)

    if ((event.ctrlKey && event.key === 'Enter') || event.key === 'F5') {
      event.preventDefault()
      const selectedText = range && !range.collapsed
        ? selection?.toString() || ''
        : this.getCurrentLineContent(div.innerText, range?.startOffset || 0)
      this.runSql(selectedText)
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      this.insertTextAtCursor(div, '\t')
      return
    }

    if (event.key === 'Enter') {
      if (!div.innerText.trim()) {
        // Permite que o navegador processe o Enter no editor vazio
        return
      }
      event.preventDefault() // Previne o comportamento padrão
      this.insertLineBreak(div) // Insere uma nova linha
    }
  }

  onInput(event: Event): void {
    const div = event.target as HTMLDivElement
    const currentContent = div.innerText

    if (this.sqlContent !== currentContent) {
      this.sqlContent = currentContent
      this.sqlContentChange.emit(this.sqlContent)
    }
  }

  private insertTextAtCursor(element: HTMLDivElement, text: string): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    range.deleteContents()

    const textNode = document.createTextNode(text)
    range.insertNode(textNode)

    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private insertLineBreak(element: HTMLDivElement): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)

    const br = document.createElement('br') // Cria uma nova linha
    range.deleteContents()
    range.insertNode(br)

    // Garante que o <br> seja visível como uma nova linha
    if (!br.nextSibling) {
      const extraBr = document.createElement('br')
      element.appendChild(extraBr)
    }

    // Move o cursor após o <br>
    range.setStartAfter(br)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
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

  runSql(sql: string): void {
    console.log(sql, 'ADWD')
  }
}