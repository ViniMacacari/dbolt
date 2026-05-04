import { Injectable } from '@angular/core'
import * as monaco from 'monaco-editor'
import { Subscription } from 'rxjs'
import { AppSettingsService } from '../app-settings/app-settings.service'
import { SqlSyntaxValidationService } from './sql-syntax-validation.service'

interface RegisteredSyntaxEditor {
  editor: monaco.editor.IStandaloneCodeEditor
  getContext: () => any
  changeDisposable: monaco.IDisposable
  settingsSubscription: Subscription
  timeoutId: ReturnType<typeof setTimeout> | null
  validationVersion: number
}

@Injectable({
  providedIn: 'root'
})
export class SqlSyntaxMonacoMarkersService {
  private readonly markerOwner = 'dbolt-sql-syntax'
  private readonly validationDelayMs = 350

  constructor(
    private settings: AppSettingsService,
    private syntaxValidation: SqlSyntaxValidationService
  ) { }

  registerEditor(
    editor: monaco.editor.IStandaloneCodeEditor,
    getContext: () => any
  ): monaco.IDisposable {
    const registeredEditor: RegisteredSyntaxEditor = {
      editor,
      getContext,
      changeDisposable: { dispose: () => undefined },
      settingsSubscription: new Subscription(),
      timeoutId: null,
      validationVersion: 0
    }

    registeredEditor.changeDisposable = editor.onDidChangeModelContent(() => {
      this.scheduleValidation(registeredEditor)
    })
    registeredEditor.settingsSubscription = this.settings.settingsChanges$.subscribe((settings) => {
        if (settings.sqlSyntaxValidationEnabled) {
          this.scheduleValidation(registeredEditor, 0)
        } else {
          registeredEditor.validationVersion++
          this.clearMarkers(editor)
        }
      })

    this.scheduleValidation(registeredEditor, 0)

    return {
      dispose: () => {
        if (registeredEditor.timeoutId) {
          clearTimeout(registeredEditor.timeoutId)
        }

        this.clearMarkers(editor)
        registeredEditor.changeDisposable.dispose()
        registeredEditor.settingsSubscription.unsubscribe()
      }
    }
  }

  private scheduleValidation(editorInfo: RegisteredSyntaxEditor, delayMs: number = this.validationDelayMs): void {
    if (editorInfo.timeoutId) {
      clearTimeout(editorInfo.timeoutId)
    }

    editorInfo.timeoutId = setTimeout(() => {
      editorInfo.timeoutId = null
      void this.validateEditor(editorInfo)
    }, delayMs)
  }

  private async validateEditor(editorInfo: RegisteredSyntaxEditor): Promise<void> {
    const model = editorInfo.editor.getModel()
    if (!model) return

    if (!this.settings.isSqlSyntaxValidationEnabled()) {
      this.clearMarkers(editorInfo.editor)
      return
    }

    const validationVersion = ++editorInfo.validationVersion
    const diagnostics = await this.syntaxValidation.validate(model.getValue(), editorInfo.getContext())
    if (validationVersion !== editorInfo.validationVersion) return

    const markers: monaco.editor.IMarkerData[] = diagnostics.map((diagnostic) => ({
      severity: monaco.MarkerSeverity.Error,
      message: diagnostic.message,
      source: 'SQL syntax',
      startLineNumber: diagnostic.startLineNumber,
      startColumn: diagnostic.startColumn,
      endLineNumber: diagnostic.endLineNumber,
      endColumn: diagnostic.endColumn
    }))

    monaco.editor.setModelMarkers(model, this.markerOwner, markers)
  }

  private clearMarkers(editor: monaco.editor.IStandaloneCodeEditor): void {
    const model = editor.getModel()
    if (!model) return

    monaco.editor.setModelMarkers(model, this.markerOwner, [])
  }
}
