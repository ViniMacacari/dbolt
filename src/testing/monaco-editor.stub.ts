export interface IDisposable {
  dispose(): void
}

export interface IRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

export class Position {
  constructor(public lineNumber: number, public column: number) { }
}

export class Range implements IRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number
  ) { }
}

export class Selection extends Range {
  readonly positionLineNumber: number
  readonly positionColumn: number

  constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
    super(startLineNumber, startColumn, endLineNumber, endColumn)
    this.positionLineNumber = endLineNumber
    this.positionColumn = endColumn
  }

  isEmpty(): boolean {
    return this.startLineNumber === this.endLineNumber && this.startColumn === this.endColumn
  }
}

const disposable = (): IDisposable => ({ dispose: () => undefined })

class FakeTextModel {
  readonly uri = { toString: () => 'inmemory://dbolt-test.sql' }
  private value: string
  decorations: Array<{ id: string; options: Record<string, unknown> }> = []

  constructor(value: string) {
    this.value = value
  }

  getValue(): string {
    return this.value
  }

  setValue(value: string): void {
    this.value = value
  }

  getLineContent(lineNumber: number): string {
    return this.value.split(/\r\n|\r|\n/)[lineNumber - 1] || ''
  }

  getFullModelRange(): Range {
    const lines = this.value.split(/\r\n|\r|\n/)
    return new Range(1, 1, lines.length, (lines.at(-1) || '').length + 1)
  }

  getValueInRange(range: IRange): string {
    const start = this.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn })
    const end = this.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn })
    return this.value.slice(start, end)
  }

  getOffsetAt(position: { lineNumber: number; column: number }): number {
    const lines = this.value.split(/\r\n|\r|\n/)
    return lines.slice(0, Math.max(0, position.lineNumber - 1))
      .reduce((offset, line) => offset + line.length + 1, 0) + Math.max(0, position.column - 1)
  }

  getWordAtPosition(position: { lineNumber: number; column: number }): { word: string; startColumn: number; endColumn: number } | null {
    const line = this.getLineContent(position.lineNumber)
    const offset = Math.max(0, position.column - 1)
    let start = offset
    let end = offset
    while (start > 0 && /[A-Za-z0-9_$#]/.test(line[start - 1])) start--
    while (end < line.length && /[A-Za-z0-9_$#]/.test(line[end])) end++
    if (start === end) return null
    return { word: line.slice(start, end), startColumn: start + 1, endColumn: end + 1 }
  }

  getAllDecorations(): Array<{ id: string; options: Record<string, unknown> }> {
    return this.decorations
  }
}

class FakeCodeEditor {
  private readonly model: FakeTextModel
  private readonly contentListeners: Array<(event: any) => void> = []
  private selection = new Selection(1, 1, 1, 1)
  private decorationSequence = 0

  constructor(private host: HTMLElement, value: string) {
    this.model = new FakeTextModel(value)
  }

  getModel(): FakeTextModel {
    return this.model
  }

  getValue(): string {
    return this.model.getValue()
  }

  setValue(value: string): void {
    this.model.setValue(value)
    this.contentListeners.forEach((listener) => listener({ changes: [] }))
  }

  getSelection(): Selection {
    return this.selection
  }

  getPosition(): Position {
    return new Position(this.selection.positionLineNumber, this.selection.positionColumn)
  }

  getContribution(): any {
    return null
  }

  getAction(): any {
    return null
  }

  setSelection(selection: Selection): void {
    this.selection = selection
  }

  onDidChangeModelContent(listener: (event: any) => void): IDisposable {
    this.contentListeners.push(listener)
    return disposable()
  }

  onMouseDown(): IDisposable { return disposable() }
  onMouseMove(): IDisposable { return disposable() }
  onMouseLeave(): IDisposable { return disposable() }
  onDidLayoutChange(): IDisposable { return disposable() }
  onDidScrollChange(): IDisposable { return disposable() }
  addAction(): IDisposable { return disposable() }
  pushUndoStop(): void { }
  focus(): void { }
  layout(): void { }
  dispose(): void { }
  getScrollLeft(): number { return 0 }
  getDomNode(): HTMLElement { return this.host }
  getLayoutInfo(): { width: number; contentLeft: number; verticalScrollbarWidth: number } {
    return { width: this.host.clientWidth || 800, contentLeft: 50, verticalScrollbarWidth: 10 }
  }
  getOption(option: number): unknown {
    return option === editor.EditorOption.lineHeight
      ? 20
      : { fontFamily: 'Consolas', fontSize: 12 }
  }

  executeEdits(_source: string, edits: Array<{ text: string }>, _endCursorState?: Selection[]): void {
    this.setValue(edits[0]?.text || '')
  }

  deltaDecorations(_oldDecorations: string[], decorations: Array<{ options: Record<string, unknown> }>): string[] {
    this.model.decorations = decorations.map((decoration) => ({
      id: `decoration-${++this.decorationSequence}`,
      options: decoration.options
    }))
    return this.model.decorations.map((decoration) => decoration.id)
  }

  changeViewZones(callback: (accessor: {
    addZone: () => string
    removeZone: () => void
    layoutZone: () => void
  }) => void): void {
    callback({
      addZone: () => 'test-zone',
      removeZone: () => undefined,
      layoutZone: () => undefined
    })
  }
}

export namespace editor {
  export interface IStandaloneCodeEditor {
    getModel(): ITextModel | null
    getValue(): string
    setValue(value: string): void
    getSelection(): Selection | null
    getPosition(): Position | null
    getContribution(id: string): any
    getAction(id: string): any
    addAction(action: any): IDisposable
    deltaDecorations(oldDecorations: string[], decorations: IModelDeltaDecoration[]): string[]
    executeEdits(source: string, edits: any[], endCursorState?: Selection[]): void
    pushUndoStop(): void
    getDomNode(): HTMLElement | null
    getOption(option: number): any
    getLayoutInfo(): any
    getScrollLeft(): number
    layout(): void
    focus(): void
    dispose(): void
    onDidChangeModelContent(listener: (event: IModelContentChangedEvent) => void): IDisposable
    onMouseDown(listener: (event: IEditorMouseEvent) => void): IDisposable
    onMouseMove(listener: (event: IEditorMouseEvent) => void): IDisposable
    onMouseLeave(listener: (event: IEditorMouseEvent) => void): IDisposable
    onDidLayoutChange(listener: (event: any) => void): IDisposable
    onDidScrollChange(listener: (event: any) => void): IDisposable
    changeViewZones(callback: (accessor: {
      addZone(zone: IViewZone): string
      removeZone(id: string): void
      layoutZone(id: string): void
    }) => void): void
  }
  export interface ITextModel {
    readonly uri: { toString(): string }
    getValue(): string
    getLineContent(lineNumber: number): string
    getFullModelRange(): IRange
    getValueInRange(range: IRange): string
    getOffsetAt(position: Position): number
    getWordAtPosition(position: Position): any
  }
  export type IEditorMouseEvent = any
  export interface IModelContentChange {
    range: IRange
    rangeLength: number
    text: string
  }
  export interface IModelContentChangedEvent {
    changes: IModelContentChange[]
  }
  export interface IModelDeltaDecoration {
    range: IRange
    options: Record<string, unknown>
  }
  export type IMarkerData = any
  export type ITokenThemeRule = any
  export type IViewZone = any

  export const EditorOption = { lineHeight: 1, fontInfo: 2 }
  export const MouseTargetType = { GUTTER_LINE_DECORATIONS: 4 }

  export function create(host: HTMLElement, options: Record<string, any>): IStandaloneCodeEditor {
    return new FakeCodeEditor(host, options['value'] || '')
  }

  export function defineTheme(_name: string, _theme: any): void { }
  export function setTheme(_name: string): void { }
  export function setModelMarkers(_model: any, _owner: string, _markers: any[]): void { }
}

export namespace languages {
  export interface CompletionItem {
    label: any
    kind: number
    insertText: string
    range: IRange
    detail?: string
    documentation?: string
    sortText?: string
    filterText?: string
  }
  export type CompletionList = any
  export const CompletionItemKind = { Field: 4, Struct: 22 }
  export function setMonarchTokensProvider(_language: string, _definition: any): void { }
  export function registerCompletionItemProvider(_language: string, _provider: {
    provideCompletionItems: (model: any, position: any, context: any, token: any) => any
    [key: string]: any
  }): IDisposable { return disposable() }
}

export const KeyMod = { Alt: 512, Shift: 1024 }
export const KeyCode = { KeyF: 36 }
export const MarkerSeverity = { Error: 8 }
