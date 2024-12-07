import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import * as monaco from 'monaco-editor'
import { LoadingComponent } from '../../modal/loading/loading.component'
import { TableQueryComponent } from "../table-query/table-query.component"

@Component({
  selector: 'app-code-editor',
  standalone: true,
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss'],
  imports: [TableQueryComponent, CommonModule]
})
export class CodeEditorComponent implements AfterViewChecked, OnDestroy {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()

  @ViewChild('editorContainer') editorContainer!: ElementRef
  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private initialized = false

  queryReponse: any[] = []

  constructor(
    private dbSchema: GetDbschemaService,
    private runQuery: RunQueryService
  ) { }

  ngAfterViewChecked(): void {
    if (!this.initialized && this.editorContainer?.nativeElement) {
      this.initialized = true
      this.initializeEditor()
    }

    (window as any).MonacoEnvironment = {
      getWorker: () => {
        return new Worker(URL.createObjectURL(new Blob([''])))
      }
    }
  }

  ngOnChanges(): void {
    if (this.editor && this.sqlContent !== this.editor.getValue()) {
      this.editor.setValue(this.sqlContent || '')
    }
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose()
    }
  }

  private initializeEditor(): void {
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
      value: this.sqlContent || 'select * from funcionarios',
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
      fontFamily: 'Nunito',
      selectionHighlight: false,
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off',
      contextmenu: false
    })

    this.editor.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || ''
      if (value !== this.sqlContent) {
        this.sqlContent = value
        this.sqlContentChange.emit(value)
      }
    })

    this.initializeEditorEvents()
  }

  private initializeEditorEvents(): void {
    this.editor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const model = this.editor?.getModel()
      const selection = this.editor?.getSelection()

      if (model && selection) {
        const content = model.getValue()
        const cursorLine = selection.startLineNumber

        const blocks = content
          .split(/(?:\n\s*\n|;)/gm)
          .map(block => block.trim())
          .filter(block => block.length > 0)

        let currentLine = 1

        for (const block of blocks) {
          const blockLines = block.split('\n').filter(line => line.trim().length > 0)
          const blockStartLine = currentLine
          const blockEndLine = currentLine + blockLines.length - 1

          if (cursorLine >= blockStartLine && cursorLine <= blockEndLine) {
            this.runSql(block)
            return
          }

          currentLine = blockEndLine + 1
        }

        if (selection.startLineNumber === selection.endLineNumber && content.trim()) {
          const currentLineContent = model.getLineContent(cursorLine).trim()
          this.runSql(currentLineContent)
          return
        }

      }
    })

    this.editor?.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || ''
      if (value !== this.sqlContent) {
        this.sqlContent = value
        this.sqlContentChange.emit(value)
      }
    })
  }

  async runSql(sql: string): Promise<void> {
    LoadingComponent.show()

    const result: any = await this.runQuery.runSQL(sql)
    this.queryReponse = result

    LoadingComponent.hide()
  }
}