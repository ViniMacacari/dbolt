import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core'
import * as monaco from 'monaco-editor'

@Component({
  selector: 'app-code-editor',
  standalone: true,
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss']
})
export class CodeEditorComponent implements AfterViewChecked, OnDestroy {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()

  @ViewChild('editorContainer') editorContainer!: ElementRef
  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private initialized = false

  ngAfterViewChecked(): void {
    if (!this.initialized && this.editorContainer?.nativeElement) {
      this.initialized = true
      this.initializeEditor()
    }
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose()
    }
  }

  private initializeEditor(): void {
    // Define o tema ANTES de criar o editor
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '739eca', fontStyle: 'bold' },
        { token: 'keyword.sql', foreground: '739eca', fontStyle: 'bold' },
        { token: 'keyword.operator', foreground: '739eca', fontStyle: 'bold' },
        { token: 'string', foreground: 'e5e887' },
        { token: 'string.escape', foreground: 'ff79c6' },
        { token: 'keyword.operator', foreground: 'badedc' },
        { token: 'string.sql', foreground: 'cac580' },
        { token: 'number', foreground: 'd996ff' },
        { token: 'identifier', foreground: 'e8e7e6' },
        { token: 'function.sql', foreground: 'f1e02d' },
        { token: 'variable', foreground: 'c7859c' },
        { token: 'type', foreground: 'c7859c' },
        { token: 'entity.name.function', foreground: 'f1e02d' },
        { token: 'support.function', foreground: 'f1e02d' },
        { token: 'string.invalid', foreground: 'e5e887', fontStyle: 'underline' }
      ],
      colors: {
        'editor.background': '#00000000',
        'editor.foreground': '#f8f8f2',
        'editorLineNumber.foreground': '#6272a4',
        'editorLineNumber.activeForeground': '#ffffff',
        'editorCursor.foreground': '#ffffff',
        'editorGutter.background': '#00000000',
        'editorLineHighlightBorder': '#00000000',
        'editorLineHighlightBackground': '#00000000',
        'editorWidget.border': '#00000000',
        'focusBorder': '#00000000'
      }
    })

    this.editor = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this.sqlContent || 'SELECT MAX(NS."DocNum"), * FROM OINV NS WHERE 1 = 1 AND "A" = "A"',
      language: 'sql',
      theme: 'custom-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      glyphMargin: false,
      lineDecorationsWidth: 30,
      lineNumbersMinChars: 2,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto'
      },
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      renderWhitespace: 'none',
      stickyScroll: { enabled: false },
      folding: false,
      fontFamily: 'Nunito'
    })

    this.editor.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || ''
      if (value !== this.sqlContent) {
        this.sqlContent = value
        console.log(this.sqlContent)
        this.sqlContentChange.emit(value)
      }
    })
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!this.editor) return

    if ((event.ctrlKey && event.key === 'Enter') || event.key === 'F5') {
      event.preventDefault()
      const selectedText = this.editor.getModel()?.getValueInRange(this.editor.getSelection()!) || ''
      this.runSql(selectedText || this.editor.getValue())
    }
  }

  runSql(sql: string): void {
    console.log('Executing SQL:', sql)
  }
}