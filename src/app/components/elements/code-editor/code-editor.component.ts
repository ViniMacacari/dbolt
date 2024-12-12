import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import * as monaco from 'monaco-editor'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { LoadingComponent } from '../../modal/loading/loading.component'
import { ToastComponent } from '../../toast/toast.component'
import { TableQueryComponent } from "../table-query/table-query.component"
import { SaveQueryComponent } from "../../modal/save-query/save-query.component"
import { InternalApiService } from '../../../services/requests/internal-api.service'

@Component({
  selector: 'app-code-editor',
  standalone: true,
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss'],
  imports: [TableQueryComponent, CommonModule, ToastComponent, SaveQueryComponent],
})
export class CodeEditorComponent implements AfterViewChecked, OnDestroy {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any

  @ViewChild('editorContainer') editorContainer!: ElementRef
  @ViewChild(ToastComponent) toast!: ToastComponent
  @ViewChild(SaveQueryComponent) saveConnection!: SaveQueryComponent

  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private initialized = false

  isSaveAsOpen: boolean = false
  cacheSql: string = ''
  queryReponse: any[] = []
  queryLines: number = 50
  maxResultLines: number | null = 0

  dataSave: any = {}

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private IAPI: InternalApiService
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
      value: this.sqlContent || '',
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
      this.runSelected()
    })

    this.editor?.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || ''
      if (value !== this.sqlContent) {
        this.sqlContent = value
        this.sqlContentChange.emit(value)
      }
    })
  }

  runSelected(): void {
    const model = this.editor?.getModel()
    const selection = this.editor?.getSelection()

    if (model && selection) {
      const selectedText = model.getValueInRange(selection).trim()

      if (selectedText) {
        this.runSql(selectedText)
        return
      }

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
      }
    }
  }

  runAll(): void {
    this.runSql(this.editor?.getValue() || '')
  }

  async runSql(sql: string): Promise<void> {
    LoadingComponent.show()

    try {
      this.queryLines = 50
      this.cacheSql = sql

      const result: any = await this.runQuery.runSQL(sql, this.queryLines)
      this.queryReponse = result
      this.maxResultLines = this.runQuery.getQueryLines()

      console.log(result)
    } catch (error: any) {
      console.log(error)
      this.toast.showToast(error.error, 'red')
    }

    LoadingComponent.hide()
  }

  async newValues(): Promise<void> {
    if (this.queryReponse.length >= (this.maxResultLines || 0)) return

    LoadingComponent.show()

    try {
      this.queryLines += 50
      const result: any = await this.runQuery.runSQL(this.cacheSql, this.queryLines)
      this.queryReponse = result
    } catch (error: any) {
      console.log(error)
      this.toast.showToast(error.error, 'red')
    }

    LoadingComponent.hide()
  }

  async saveAs(): Promise<void> {
    this.isSaveAsOpen = true

    const dbSchemas = await this.dbSchemas.getSelectedSchemaDB()

    this.dataSave = {
      sql: this.editor?.getValue() || '',
      dataDbSchema: dbSchemas
    }
  }

  async savedSaveAs(name: any): Promise<void> {
    this.savedName.emit(name)
  }

  async saveQuery(): Promise<void> {
    try {
      const dbSchemas = await this.dbSchemas.getSelectedSchemaDB()

      this.dataSave = {
        name: this.tabInfo?.name,
        type: 'sql',
        sql: this.editor?.getValue() || '',
        dbSchema: dbSchemas
      }

      await this.IAPI.put('/api/query/' + this.tabInfo.id, this.dataSave)
    } catch (error: any) {
      this.toast.showToast(error.error, 'red')
    }
  }

  async closeSaveAs(): Promise<void> {
    this.isSaveAsOpen = false
  }
}