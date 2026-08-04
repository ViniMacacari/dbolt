import { CommonModule } from '@angular/common'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ButtonComponent } from '../button/button.component'
import { CheckboxComponent } from '../checkbox/checkbox.component'
import { InputComponent } from '../input/input.component'
import { InputListComponent } from '../input-list/input-list.component'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { ConnectionsService, SavedConnection } from '../../../services/resolve-connections/connections.service'
import {
  DatabaseExportConnectionState,
  DatabaseExportContext,
  DatabaseExportEstimate,
  DatabaseExportObject,
  DatabaseExportObjectType,
  DatabaseExportOptions,
  DatabaseExportProgress,
  DatabaseExportResult,
  DatabaseExportTarget
} from '../../../services/database-export/database-export.model'
import { DatabaseExportService } from '../../../services/database-export/database-export.service'

type ExportObjectGroup = 'tables' | 'views' | 'routines' | 'automation' | 'sequences' | 'types' | 'synonyms' | 'indexes'
type DatabaseExportStep = 1 | 2 | 3 | 4

interface ExportObjectGroupDefinition {
  id: ExportObjectGroup
  types: DatabaseExportObjectType[]
  labelKey: string
  icon: string
  engines: string[]
}

interface ExportObjectGroupView extends ExportObjectGroupDefinition {
  objects: DatabaseExportObject[]
  selectedCount: number
  totalCount: number
  allVisibleSelected: boolean
}

interface ExportObjectGroupSummary extends ExportObjectGroupDefinition {
  totalCount: number
}

@Component({
  selector: 'app-db-export',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, CheckboxComponent, InputComponent, InputListComponent],
  templateUrl: './db-export.component.html',
  styleUrl: './db-export.component.scss'
})
export class DbExportComponent implements OnInit, OnDestroy {
  @Input() tabInfo: unknown

  currentStep: DatabaseExportStep = 1

  connections: SavedConnection[] = []
  selectedConnectionId: number | null = null
  connectionState: DatabaseExportConnectionState | null = null
  targets: DatabaseExportTarget[] = []
  selectedDatabase: string = ''
  selectedSchema: string = ''
  context: DatabaseExportContext | null = null
  objects: DatabaseExportObject[] = []
  objectGroupViews: ExportObjectGroupView[] = []
  objectGroupSummaries: ExportObjectGroupSummary[] = []
  selectedObjectKeys = new Set<string>()
  objectSearch: string = ''

  includeStructure: boolean = true
  includeData: boolean = false
  addDropStatements: boolean = false
  acknowledgedLargeExport: boolean = false

  loadingConnections: boolean = false
  loadingTargets: boolean = false
  loadingObjects: boolean = false
  estimating: boolean = false
  exporting: boolean = false
  cancelled: boolean = false
  errorMessage: string = ''

  estimate: DatabaseExportEstimate | null = null
  progress: DatabaseExportProgress | null = null
  result: DatabaseExportResult | null = null
  outputPath: string = ''

  readonly objectGroups: ExportObjectGroupDefinition[] = [
    { id: 'tables', types: ['table'], labelKey: 'dbExport.objects.tables', icon: 'icons/table.png', engines: ['mysql', 'postgres', 'hana', 'sqlserver', 'sqlite'] },
    { id: 'views', types: ['view', 'materialized_view'], labelKey: 'dbExport.objects.views', icon: 'icons/view.png', engines: ['mysql', 'postgres', 'hana', 'sqlserver', 'sqlite'] },
    { id: 'routines', types: ['procedure', 'function'], labelKey: 'dbExport.objects.routines', icon: 'icons/procedure.png', engines: ['mysql', 'postgres', 'hana', 'sqlserver'] },
    { id: 'automation', types: ['trigger', 'event'], labelKey: 'dbExport.objects.automation', icon: 'icons/run.png', engines: ['mysql', 'postgres', 'hana', 'sqlserver', 'sqlite'] },
    { id: 'sequences', types: ['sequence'], labelKey: 'dbExport.objects.sequences', icon: 'icons/key.png', engines: ['postgres', 'hana', 'sqlserver'] },
    { id: 'types', types: ['type', 'domain'], labelKey: 'dbExport.objects.types', icon: 'icons/code.png', engines: ['postgres', 'sqlserver'] },
    { id: 'synonyms', types: ['synonym'], labelKey: 'dbExport.objects.synonyms', icon: 'icons/database.png', engines: ['hana', 'sqlserver'] },
    { id: 'indexes', types: ['index'], labelKey: 'dbExport.objects.indexes', icon: 'icons/index.png', engines: ['mysql', 'postgres', 'hana', 'sqlserver', 'sqlite'] }
  ]

  readonly steps: Array<{ id: DatabaseExportStep; labelKey: string }> = [
    { id: 1, labelKey: 'dbExport.steps.source' },
    { id: 2, labelKey: 'dbExport.steps.objects' },
    { id: 3, labelKey: 'dbExport.steps.content' },
    { id: 4, labelKey: 'dbExport.steps.destination' }
  ]

  private exportAbortController: AbortController | null = null

  constructor(
    private connectionsService: ConnectionsService,
    private databaseExport: DatabaseExportService,
    private language: AppLanguageService
  ) { }

  async ngOnInit(): Promise<void> {
    await this.loadConnections()
  }

  ngOnDestroy(): void {
    this.exportAbortController?.abort()
    void this.releaseConnection(this.connectionState?.context)
  }

  get selectedConnection(): SavedConnection | null {
    return this.connections.find((connection) => connection.id === this.selectedConnectionId) || null
  }

  get databaseOptions(): string[] {
    return this.targets.map((target) => target.database)
  }

  get schemaOptions(): string[] {
    return this.targets.find((target) => target.database === this.selectedDatabase)?.schemas || []
  }

  get selectedObjects(): DatabaseExportObject[] {
    return this.objects.filter((object) => this.selectedObjectKeys.has(this.objectKey(object)))
  }

  get selectedObjectCount(): number {
    return this.selectedObjectKeys.size
  }

  get selectedTableCount(): number {
    return this.selectedObjects.filter((object) => object.type === 'table').length
  }

  get allObjectsSelected(): boolean {
    return this.objects.length > 0 && this.objects.every((object) => this.isObjectSelected(object))
  }

  get canLoadObjects(): boolean {
    return Boolean(this.connectionState && this.selectedDatabase && this.selectedSchema && !this.loadingObjects)
  }

  get canEstimate(): boolean {
    return Boolean(
      this.context &&
      this.selectedObjectCount > 0 &&
      (this.includeStructure || this.includeData) &&
      (!this.includeData || this.includeStructure || this.selectedTableCount > 0) &&
      !this.estimating &&
      !this.exporting
    )
  }

  get canStartExport(): boolean {
    return Boolean(
      this.canEstimate &&
      this.estimate &&
      this.outputPath &&
      (!this.estimate.acknowledgementRequired || this.acknowledgedLargeExport)
    )
  }

  get canContinue(): boolean {
    if (this.currentStep === 1) return Boolean(this.context)
    if (this.currentStep === 2) return this.selectedObjectCount > 0
    if (this.currentStep === 3) {
      return Boolean(
        this.estimate &&
        (!this.estimate.acknowledgementRequired || this.acknowledgedLargeExport)
      )
    }
    return this.canStartExport
  }

  get exportProgressPercentage(): number {
    if (!this.progress?.totalObjects) return 0
    return Math.min(100, Math.round((this.progress.completedObjects / this.progress.totalObjects) * 100))
  }

  get destinationAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.dboltFileSystem)
  }

  get connectionListOptions(): Array<{ id: number; label: string }> {
    return this.connections.map((connection) => ({
      id: connection.id,
      label: `${connection.name} · ${connection.database}`
    }))
  }

  get databaseListOptions(): Array<{ name: string }> {
    return this.databaseOptions.map((name) => ({ name }))
  }

  get schemaListOptions(): Array<{ name: string }> {
    return this.schemaOptions.map((name) => ({ name }))
  }

  async loadConnections(): Promise<void> {
    this.loadingConnections = true
    this.errorMessage = ''

    try {
      this.connections = await this.connectionsService.loadConnections()
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('dbExport.errors.loadConnections'))
    } finally {
      this.loadingConnections = false
    }
  }

  onConnectionSelected(item: { [key: string]: string | number } | null): void {
    const previousContext = this.connectionState?.context
    const value = Number(item?.['id'])
    this.selectedConnectionId = Number.isFinite(value) && value > 0 ? value : null
    this.resetTargetState()
    void this.releaseConnection(previousContext)
  }

  async loadTargets(): Promise<void> {
    const connection = this.selectedConnection
    if (!connection || this.loadingTargets) return

    this.loadingTargets = true
    this.errorMessage = ''
    const previousContext = this.connectionState?.context
    this.resetTargetState(false)

    try {
      await this.releaseConnection(previousContext)
      this.connectionState = null
      this.connectionState = await this.databaseExport.connectAndLoadTargets(connection)
      this.targets = this.connectionState.targets
      this.selectedDatabase = this.resolveInitialDatabase(connection)
      this.refreshSelectedSchema(connection.defaultSchema)
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('dbExport.errors.loadTargets'))
    } finally {
      this.loadingTargets = false
    }
  }

  onDatabaseSelected(item: { [key: string]: string | number } | null): void {
    this.selectedDatabase = String(item?.['name'] || '')
    this.refreshSelectedSchema()
    this.resetObjectState()
  }

  onSchemaSelected(item: { [key: string]: string | number } | null): void {
    this.selectedSchema = String(item?.['name'] || '')
    this.resetObjectState()
  }

  async loadObjects(): Promise<void> {
    if (!this.connectionState || !this.canLoadObjects) return

    this.loadingObjects = true
    this.errorMessage = ''
    this.resetObjectState()

    try {
      const result = await this.databaseExport.loadObjects(
        this.connectionState,
        this.selectedDatabase,
        this.selectedSchema
      )
      this.context = result.context
      this.objects = result.objects
      this.refreshObjectGroupViews()
      this.currentStep = 2
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('dbExport.errors.loadObjects'))
    } finally {
      this.loadingObjects = false
    }
  }

  updateObjectSearch(value: string | number | null): void {
    this.objectSearch = String(value || '')
    this.refreshObjectGroupViews()
  }

  toggleGroup(group: ExportObjectGroupView, selected: boolean): void {
    if (this.exporting || group.objects.length === 0) return
    group.objects.forEach((object) => this.setObjectSelected(object, selected))
    this.invalidateEstimate()
    this.refreshObjectGroupViews()
  }

  toggleObject(object: DatabaseExportObject, selected: boolean): void {
    if (this.exporting) return
    this.setObjectSelected(object, selected)
    this.invalidateEstimate()
    this.refreshObjectGroupViews()
  }

  toggleAllObjects(): void {
    const select = !this.allObjectsSelected
    this.objects.forEach((object) => this.setObjectSelected(object, select))
    this.invalidateEstimate()
    this.refreshObjectGroupViews()
  }

  isObjectSelected(object: DatabaseExportObject): boolean {
    return this.selectedObjectKeys.has(this.objectKey(object))
  }

  objectKey(object: DatabaseExportObject): string {
    return `${object.type}:${object.table || ''}:${object.name}`
  }

  onExportOptionChanged(): void {
    if (!this.includeStructure) this.addDropStatements = false
    this.invalidateEstimate()
  }

  setIncludeStructure(value: boolean): void {
    this.includeStructure = value
    this.onExportOptionChanged()
  }

  setIncludeData(value: boolean): void {
    this.includeData = value
    this.onExportOptionChanged()
  }

  setAddDropStatements(value: boolean): void {
    this.addDropStatements = value
    this.onExportOptionChanged()
  }

  goToStep(step: DatabaseExportStep): void {
    if (this.exporting || !this.canOpenStep(step)) return
    this.currentStep = step
  }

  previousStep(): void {
    if (this.exporting || this.currentStep === 1) return
    this.currentStep = (this.currentStep - 1) as DatabaseExportStep
  }

  nextStep(): void {
    if (this.exporting || !this.canContinue || this.currentStep === 4) return
    this.currentStep = (this.currentStep + 1) as DatabaseExportStep
  }

  canOpenStep(step: DatabaseExportStep): boolean {
    if (step === 1) return true
    if (step === 2) return Boolean(this.context)
    if (step === 3) return Boolean(this.context && this.selectedObjectCount > 0)
    return Boolean(
      this.context &&
      this.selectedObjectCount > 0 &&
      this.estimate &&
      (!this.estimate.acknowledgementRequired || this.acknowledgedLargeExport)
    )
  }

  isStepComplete(step: DatabaseExportStep): boolean {
    if (step === 1) return Boolean(this.context)
    if (step === 2) return this.selectedObjectCount > 0
    if (step === 3) {
      return Boolean(
        this.estimate &&
        (!this.estimate.acknowledgementRequired || this.acknowledgedLargeExport)
      )
    }
    return Boolean(this.result)
  }

  async analyzeExport(): Promise<void> {
    if (!this.context || !this.canEstimate) return

    this.estimating = true
    this.errorMessage = ''
    this.result = null
    this.acknowledgedLargeExport = false

    try {
      this.estimate = await this.databaseExport.estimate(
        this.context,
        this.selectedObjects,
        this.includeData
      )
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('dbExport.errors.estimate'))
      this.estimate = null
    } finally {
      this.estimating = false
    }
  }

  async chooseDestination(): Promise<void> {
    this.errorMessage = ''

    try {
      const path = await this.databaseExport.chooseDestination(this.suggestedFileName())
      if (path) this.outputPath = path
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error, this.t('dbExport.errors.destination'))
    }
  }

  async startExport(): Promise<void> {
    if (!this.context || !this.canStartExport) return

    this.exporting = true
    this.cancelled = false
    this.errorMessage = ''
    this.result = null
    this.progress = {
      stage: 'preparing',
      completedObjects: 0,
      totalObjects: this.selectedObjectCount +
        (this.includeData ? this.selectedTableCount : 0) +
        (this.includeStructure && this.context.sgbd.toLowerCase() !== 'mysql' ? this.selectedTableCount : 0),
      rowsWritten: 0,
      estimatedRows: this.estimate?.estimatedRows || 0,
      bytesWritten: 0
    }
    this.exportAbortController = new AbortController()

    const options: DatabaseExportOptions = {
      includeStructure: this.includeStructure,
      includeData: this.includeData,
      addDropStatements: this.addDropStatements,
      acknowledgedLargeExport: this.acknowledgedLargeExport
    }

    try {
      const result = await this.databaseExport.run(
        this.context,
        this.selectedObjects,
        options,
        this.outputPath,
        (event) => {
          if (event.type === 'progress') this.progress = event.data
          if (event.type === 'result') this.result = event.data
          if (event.type === 'cancelled') this.cancelled = true
        },
        this.exportAbortController.signal
      )
      if (result) this.result = result
    } catch (error: unknown) {
      if (this.exportAbortController.signal.aborted) {
        this.cancelled = true
      } else {
        this.errorMessage = this.getErrorMessage(error, this.t('dbExport.errors.export'))
      }
    } finally {
      this.exporting = false
      this.exportAbortController = null
    }
  }

  cancelExport(): void {
    this.exportAbortController?.abort()
  }

  riskLabel(risk: DatabaseExportEstimate['risk']): string {
    return this.t(`dbExport.risk.${risk}`)
  }

  warningLabel(warning: string): string {
    return this.t(`dbExport.warning.${warning}`)
  }

  progressStageLabel(): string {
    return this.t(`dbExport.progress.${this.progress?.stage || 'preparing'}`)
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat(this.language.getCurrentLanguage()).format(value || 0)
  }

  formatBytes(value: number): string {
    if (!value) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    const amount = value / (1024 ** exponent)
    return `${amount.toLocaleString(this.language.getCurrentLanguage(), { maximumFractionDigits: 1 })} ${units[exponent]}`
  }

  trackObject(_index: number, object: DatabaseExportObject): string {
    return `${object.type}:${object.table || ''}:${object.name}`
  }

  objectTypeLabel(type: DatabaseExportObjectType): string {
    return this.t(`dbExport.objectType.${type}`)
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private resolveInitialDatabase(connection: SavedConnection): string {
    if (connection.defaultDatabase && this.databaseOptions.includes(connection.defaultDatabase)) {
      return connection.defaultDatabase
    }
    return this.databaseOptions.length === 1 ? this.databaseOptions[0] : ''
  }

  private refreshSelectedSchema(preferredSchema?: string): void {
    const schemas = this.schemaOptions
    if (preferredSchema && schemas.includes(preferredSchema)) {
      this.selectedSchema = preferredSchema
      return
    }
    this.selectedSchema = schemas.length === 1 ? schemas[0] : ''
  }

  private setObjectSelected(object: DatabaseExportObject, selected: boolean): void {
    const key = this.objectKey(object)
    if (selected) this.selectedObjectKeys.add(key)
    else this.selectedObjectKeys.delete(key)
  }

  private refreshObjectGroupViews(): void {
    const search = this.objectSearch.trim().toLowerCase()
    const engine = this.normalizeEngine(this.context?.sgbd)
    const supportedGroups = this.objectGroups.filter((group) => group.engines.includes(engine))

    this.objectGroupSummaries = supportedGroups.map((group) => ({
      ...group,
      totalCount: this.objects.filter((object) => group.types.includes(object.type)).length
    }))

    this.objectGroupViews = supportedGroups
      .map((group) => {
        const groupObjects = this.objects.filter((object) => group.types.includes(object.type))
        const visibleObjects = groupObjects.filter((object) =>
          !search ||
          object.name.toLowerCase().includes(search) ||
          Boolean(object.table?.toLowerCase().includes(search))
        )

        return {
          ...group,
          objects: visibleObjects,
          selectedCount: groupObjects.filter((object) => this.isObjectSelected(object)).length,
          totalCount: groupObjects.length,
          allVisibleSelected: visibleObjects.length > 0 && visibleObjects.every((object) => this.isObjectSelected(object))
        }
      })
      .filter((group) => group.totalCount > 0)
  }

  private normalizeEngine(value: unknown): string {
    const engine = String(value || '').trim().toLowerCase()
    if (engine === 'postgresql') return 'postgres'
    if (engine === 'mssql') return 'sqlserver'
    return engine
  }

  private invalidateEstimate(): void {
    this.estimate = null
    this.acknowledgedLargeExport = false
    this.result = null
    this.progress = null
    this.cancelled = false
  }

  private resetTargetState(clearConnection = true): void {
    if (clearConnection) this.connectionState = null
    this.targets = []
    this.selectedDatabase = ''
    this.selectedSchema = ''
    this.resetObjectState()
  }

  private resetObjectState(): void {
    this.currentStep = 1
    this.context = null
    this.objects = []
    this.objectGroupViews = []
    this.objectGroupSummaries = []
    this.selectedObjectKeys.clear()
    this.objectSearch = ''
    this.outputPath = ''
    this.invalidateEstimate()
  }

  private suggestedFileName(): string {
    const target = [this.selectedDatabase, this.selectedSchema]
      .filter(Boolean)
      .join('-')
      .replace(/[^A-Za-z0-9._-]+/g, '-') || 'database'
    return `${target}-${new Date().toISOString().slice(0, 10)}.sql`
  }

  private getErrorMessage(error: any, fallback: string): string {
    return error?.error || error?.message || fallback
  }

  private async releaseConnection(context?: DatabaseExportContext): Promise<void> {
    if (!context) return
    await this.databaseExport.disconnect(context).catch(() => undefined)
  }
}
