import { Component } from '@angular/core'

@Component({
  selector: 'app-code-editor',
  standalone: true,
  imports: [],
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.scss'
})
export class CodeEditorComponent {
  handleTab(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault()
      const textarea = event.target as HTMLTextAreaElement
      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      const tab = '\t'
      textarea.value = textarea.value.substring(0, start) + tab + textarea.value.substring(end)

      textarea.selectionStart = textarea.selectionEnd = start + tab.length
    }
  }
}
