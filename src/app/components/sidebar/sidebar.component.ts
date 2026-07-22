import { Component, Input, ViewChild, EventEmitter, Output, HostListener, OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'
import { ToastComponent } from '../toast/toast.component'
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { Router } from '@angular/router'
import { ConnectionsService } from '../../services/resolve-connections/connections.service'
import { ConnectionComponent } from '../modal/connection/connection.component'
import { AppLanguageService } from '../../services/language/app-language.service'

export interface SidebarLayoutChange {
  visible: boolean
  width: number
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, ToastComponent, ConnectionComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  host: {
    '[class.layout-suppressed]': 'layoutSuppressed',
    '[style.flex-basis.px]': 'layoutSuppressed ? 0 : layoutWidth',
    '[style.max-width.px]': 'layoutSuppressed ? 0 : layoutWidth',
    '[attr.aria-hidden]': 'layoutSuppressed ? "true" : null',
    '[attr.inert]': 'layoutSuppressed ? "" : null'
  }
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() connections: any[] = []
  @Input() activeConnection: any = { info: {}, data: [] }
  @Input() dbSchemas: any = []
  @Input() selectedSchemaDB: any
  @Input() layoutSuppressed: boolean = false
  @Output() sidebarStatusChange = new EventEmitter<SidebarLayoutChange>()
  @Output() dbInfoRequested = new EventEmitter<any>()
  @Output() selectedSchemaChanged = new EventEmitter<any>()
  @Output() settingsRequested = new EventEmitter<void>()
  @Output() sqlScriptRequested = new EventEmitter<any>()
  @Output() contextConnectionRequested = new EventEmitter<{ context: any, forceReconnect: boolean }>()

  @ViewChild('toast') toast!: ToastComponent

  isModalOpen: boolean = false
  editingConnection: any = null
  sidebarWidth: number = 180
  sidebarVisible: boolean = true
  resizingSidebar: boolean = false
  expandedConnections: Set<number> = new Set()
  expandedConnectionContents: Set<number> = new Set()
  expandedDatabases: Set<string> = new Set()
  loadingConnections: Set<number> = new Set()
  clickTimeout: any = null
  quickSelectorType: 'connection' | 'database' | 'schema' | null = null
  quickSelectorFilter: string = ''
  contextMenu: any = null

  readonly sidebarMinWidth: number = 160
  readonly sidebarMaxWidth: number = 480
  readonly sidebarCollapsedWidth: number = 54
  private readonly sidebarCompactWidth: number = 180
  private readonly sidebarDefaultWidth: number = 320
  private readonly sidebarLayoutStorageKey: string = 'dbolt-sidebar-layout'
  private resizeStartX: number = 0
  private resizeStartWidth: number = 0

  constructor(
    private IAPI: InternalApiService,
    private dbSchemaService: GetDbschemaService,
    private router: Router,
    private connectionsService: ConnectionsService,
    private language: AppLanguageService
  ) { }

  get layoutWidth(): number {
    return this.sidebarVisible ? this.sidebarWidth : this.sidebarCollapsedWidth
  }

  ngOnInit(): void {
    this.restoreSidebarLayout()
    this.emitSidebarLayout()
  }

  ngOnDestroy(): void {
    document.body.classList.remove('dbolt-sidebar-resizing')
  }

  toggle(): void {
    if (this.sidebarVisible) {
      this.hideSidebar()
      return
    }

    this.showSidebar()
  }

  hideSidebar(): void {
    this.finishSidebarResize()
    this.sidebarVisible = false
    this.quickSelectorType = null
    this.contextMenu = null
    this.persistSidebarLayout()
    this.emitSidebarLayout()
  }

  showSidebar(): void {
    this.sidebarVisible = true
    this.sidebarWidth = this.clampSidebarWidth(this.sidebarWidth)
    this.persistSidebarLayout()
    this.emitSidebarLayout()
  }

  startSidebarResize(event: PointerEvent): void {
    if (!this.sidebarVisible || event.button !== 0) return

    event.preventDefault()
    this.resizingSidebar = true
    this.resizeStartX = event.clientX
    this.resizeStartWidth = this.sidebarWidth
    document.body.classList.add('dbolt-sidebar-resizing')
  }

  @HostListener('window:pointermove', ['$event'])
  resizeSidebar(event: PointerEvent): void {
    if (!this.resizingSidebar) return

    const nextWidth = this.resizeStartWidth + event.clientX - this.resizeStartX
    this.sidebarWidth = this.clampSidebarWidth(nextWidth)
    this.emitSidebarLayout()
  }

  @HostListener('window:pointerup')
  finishSidebarResize(): void {
    if (!this.resizingSidebar) return

    this.resizingSidebar = false
    document.body.classList.remove('dbolt-sidebar-resizing')
    this.persistSidebarLayout()
  }

  @HostListener('window:blur')
  cancelSidebarResize(): void {
    this.finishSidebarResize()
  }

  @HostListener('window:resize')
  constrainSidebarToViewport(): void {
    const constrainedWidth = this.clampSidebarWidth(this.sidebarWidth)
    if (constrainedWidth === this.sidebarWidth) return

    this.sidebarWidth = constrainedWidth
    this.persistSidebarLayout()
    this.emitSidebarLayout()
  }

  toggleSidebarPreset(): void {
    const distanceFromCompact = Math.abs(this.sidebarWidth - this.sidebarCompactWidth)
    const distanceFromDefault = Math.abs(this.sidebarWidth - this.sidebarDefaultWidth)
    this.sidebarWidth = this.clampSidebarWidth(
      distanceFromCompact <= distanceFromDefault ? this.sidebarDefaultWidth : this.sidebarCompactWidth
    )
    this.persistSidebarLayout()
    this.emitSidebarLayout()
  }

  onSidebarResizeKeydown(event: KeyboardEvent): void {
    let nextWidth = this.sidebarWidth

    if (event.key === 'ArrowLeft') nextWidth -= 16
    else if (event.key === 'ArrowRight') nextWidth += 16
    else if (event.key === 'Home') nextWidth = this.sidebarMinWidth
    else if (event.key === 'End') nextWidth = this.getResponsiveMaxWidth()
    else return

    event.preventDefault()
    this.sidebarWidth = this.clampSidebarWidth(nextWidth)
    this.persistSidebarLayout()
    this.emitSidebarLayout()
  }

  private emitSidebarLayout(): void {
    this.sidebarStatusChange.emit({
      visible: this.sidebarVisible,
      width: this.sidebarVisible ? this.sidebarWidth : this.sidebarCollapsedWidth
    })
  }

  private clampSidebarWidth(width: number): number {
    return Math.round(Math.min(this.getResponsiveMaxWidth(), Math.max(this.sidebarMinWidth, width)))
  }

  private getResponsiveMaxWidth(): number {
    if (typeof window === 'undefined') return this.sidebarMaxWidth

    return Math.max(this.sidebarMinWidth, Math.min(this.sidebarMaxWidth, window.innerWidth - 420))
  }

  private restoreSidebarLayout(): void {
    try {
      const rawLayout = localStorage.getItem(this.sidebarLayoutStorageKey)
      if (!rawLayout) return

      const layout = JSON.parse(rawLayout)
      this.sidebarWidth = this.clampSidebarWidth(Number(layout?.width) || this.sidebarWidth)
      this.sidebarVisible = layout?.visible !== false
    } catch {
      this.sidebarWidth = 180
      this.sidebarVisible = true
    }
  }

  private persistSidebarLayout(): void {
    try {
      localStorage.setItem(this.sidebarLayoutStorageKey, JSON.stringify({
        visible: this.sidebarVisible,
        width: this.sidebarWidth
      }))
    } catch {
      // The layout still works when browser storage is unavailable.
    }
  }

  toggleQuickSelector(type: 'connection' | 'database' | 'schema', event: MouseEvent): void {
    event.stopPropagation()
    this.focusEventTarget(event)
    this.contextMenu = null

    if (this.quickSelectorType === type) {
      this.closeQuickSelector()
      return
    }

    this.quickSelectorFilter = ''
    this.quickSelectorType = type
  }

  closeQuickSelector(event?: MouseEvent): void {
    event?.stopPropagation()
    this.quickSelectorType = null
    this.quickSelectorFilter = ''
  }

  getQuickSelectorTitle(): string {
    if (this.quickSelectorType === 'connection') return this.t('sidebar.selectConnection')
    if (this.quickSelectorType === 'database') return this.t('sidebar.selectDatabase')
    if (this.quickSelectorType === 'schema') return this.t('sidebar.selectSchema')

    return ''
  }

  getQuickSelectorOptions(): any[] {
    if (this.quickSelectorType === 'connection') {
      return this.connections.map((connection) => ({
        type: 'connection',
        label: connection.name,
        description: `${connection.database} - ${connection.host}:${connection.port}`,
        icon: `db-logo/${connection.database}.png`,
        value: connection
      }))
    }

    const selectedConnection = this.getSelectedSavedConnection()
    if (!selectedConnection) return []

    if (this.quickSelectorType === 'database') {
      return this.getSchemasByConnection(selectedConnection).map((database) => ({
        type: 'database',
        label: database.database,
        description: this.t('sidebar.schemasCount', { count: database.schemas.length }),
        icon: 'icons/database.png',
        value: database,
        connection: selectedConnection
      }))
    }

    if (this.quickSelectorType === 'schema') {
      const database = this.getSchemasByConnection(selectedConnection)
        .find((item) => item.database === this.selectedSchemaDB?.database)

      return (database?.schemas || []).map((schema: string) => ({
        type: 'schema',
        label: schema,
        description: this.selectedSchemaDB?.database,
        icon: 'icons/schema.png',
        value: schema,
        database,
        connection: selectedConnection
      }))
    }

    return []
  }

  getFilteredQuickSelectorOptions(): any[] {
    const filter = this.quickSelectorFilter.trim().toLowerCase()
    const options = this.getQuickSelectorOptions()

    if (!filter) return options

    return options.filter((option) =>
      `${option.label || ''} ${option.description || ''}`.toLowerCase().includes(filter)
    )
  }

  trackQuickSelectorOption(index: number, option: any): string {
    if (!option) return String(index)

    if (option.type === 'connection') {
      const connection = option.value || {}
      return [
        option.type,
        connection.id,
        connection.database,
        connection.host,
        connection.port
      ].filter(Boolean).join(':')
    }

    if (option.type === 'database') {
      return [
        option.type,
        option.connection?.id,
        option.value?.database
      ].filter(Boolean).join(':')
    }

    if (option.type === 'schema') {
      return [
        option.type,
        option.connection?.id,
        option.database?.database,
        option.value
      ].filter(Boolean).join(':')
    }

    return `${option.type || 'option'}:${option.label || index}`
  }

  onQuickSelectorFilter(event: Event): void {
    this.quickSelectorFilter = (event.target as HTMLInputElement).value
  }

  async selectQuickOption(option: any, event: MouseEvent): Promise<void> {
    event.stopPropagation()
    LoadingComponent.show(this.t('sidebar.changingSelectedConnection'))

    try {
      if (option.type === 'connection') {
        await this.canConnect(option.value)
        const database = this.getDefaultDatabaseForConnection(option.value)
        const schema = this.getDefaultSchemaForConnection(option.value, database)

        if (database && schema) {
          await this.setSchema(this.buildSchemaSelection(option.value, database.database, schema))
        }
      }

      if (option.type === 'database') {
        const schema = option.value.schemas.includes(this.selectedSchemaDB?.schema)
          ? this.selectedSchemaDB.schema
          : option.value.schemas[0]

        if (schema) {
          await this.setSchema(this.buildSchemaSelection(option.connection, option.value.database, schema))
        }
      }

      if (option.type === 'schema') {
        await this.setSchema(this.buildSchemaSelection(option.connection, option.database.database, option.value))
      }

      this.quickSelectorType = null
    } finally {
      LoadingComponent.hide()
    }
  }

  goToHome(): void {
    this.router.navigate(['/'])
  }

  openSettings(): void {
    this.settingsRequested.emit()
  }

  @HostListener('document:click')
  closeContextMenu(): void {
    this.contextMenu = null
  }

  @HostListener('document:keydown.escape')
  closeContextMenuOnEscape(): void {
    this.contextMenu = null
  }

  openSelectedDatabaseContextMenu(event: MouseEvent): void {
    if (!this.selectedSchemaDB?.database) return

    this.openContextMenu(event, {
      type: 'database',
      label: this.selectedSchemaDB.database,
      context: this.selectedSchemaDB
    })
  }

  openSelectedSchemaContextMenu(event: MouseEvent): void {
    if (!this.selectedSchemaDB?.schema) return

    this.openContextMenu(event, {
      type: 'schema',
      label: this.selectedSchemaDB.schema,
      context: this.selectedSchemaDB
    })
  }

  openDatabaseContextMenu(connection: any, database: any, event: MouseEvent): void {
    const selection = this.buildDatabaseSelection(connection, database)
    if (!selection) return

    this.openContextMenu(event, {
      type: 'database',
      label: database.database,
      context: selection
    })
  }

  openSchemaContextMenu(connection: any, database: any, schema: string, event: MouseEvent): void {
    const selection = this.buildSchemaSelection(connection, database.database, schema)

    this.openContextMenu(event, {
      type: 'schema',
      label: schema,
      context: selection
    })
  }

  requestNewSqlScript(event: MouseEvent): void {
    event.stopPropagation()
    if (!this.contextMenu?.context) return

    this.sqlScriptRequested.emit(this.contextMenu.context)
    this.contextMenu = null
  }

  requestConnection(forceReconnect: boolean, event: MouseEvent): void {
    event.stopPropagation()
    if (!this.contextMenu?.context) return

    this.contextConnectionRequested.emit({
      context: this.contextMenu.context,
      forceReconnect
    })
    this.contextMenu = null
  }

  requestContextInfo(event: MouseEvent): void {
    event.stopPropagation()
    if (!this.contextMenu?.context) return

    this.dbInfoRequested.emit(this.contextMenu.context)
    this.contextMenu = null
  }

  private openContextMenu(event: MouseEvent, menu: any): void {
    event.preventDefault()
    event.stopPropagation()
    this.focusEventTarget(event)
    this.quickSelectorType = null

    this.contextMenu = {
      ...menu,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210))
    }
  }

  async toggleConnection(connection: any): Promise<void> {
    const connectionId = Number(connection?.id)
    if (!Number.isFinite(connectionId)) return

    if (this.expandedConnections.has(connectionId)) {
      this.expandedConnections.delete(connectionId)
      this.expandedConnectionContents.delete(connectionId)
      return
    }

    this.expandedConnections.add(connectionId)
    if (this.loadingConnections.has(connectionId)) return

    this.loadingConnections.add(connectionId)
    try {
      await this.canConnect(connection)
    } finally {
      this.loadingConnections.delete(connectionId)
      if (this.expandedConnections.has(connectionId)) {
        this.expandedConnectionContents.add(connectionId)
      }
    }
  }

  toggleDatabase(databaseId: string) {
    if (this.expandedDatabases.has(databaseId)) {
      this.expandedDatabases.delete(databaseId)
    } else {
      this.expandedDatabases.add(databaseId)
    }
  }

  isActiveConnection(connection: any): boolean {
    return this.activeConnection.some(
      (conn: any) => conn.host === connection.host && conn.port === connection.port
    )
  }

  getSchemasByConnection(connection: any): any[] {
    if (!this.dbSchemas || !this.dbSchemas.data) return []
    return this.dbSchemas.data.filter(
      (item: any) =>
        item.host === connection.host &&
        String(item.port) === String(connection.port) &&
        item.sgbd === connection.database
    )
  }

  private getDefaultDatabaseForConnection(connection: any): any {
    const databases = this.getSchemasByConnection(connection)
    if (!connection?.defaultDatabase) {
      return databases[0]
    }

    return databases.find((database) => database.database === connection.defaultDatabase) || databases[0]
  }

  private getDefaultSchemaForConnection(connection: any, database: any): string {
    if (!database) return ''

    if (connection?.defaultSchema && database.schemas?.includes(connection.defaultSchema)) {
      return connection.defaultSchema
    }

    return database.schemas?.[0] || ''
  }

  private getSelectedSavedConnection(): any {
    return this.connections.find((connection) =>
      String(connection.id) === String(this.selectedSchemaDB?.connId || this.selectedSchemaDB?.connectionId) ||
      (
        connection.host === this.selectedSchemaDB?.host &&
        String(connection.port) === String(this.selectedSchemaDB?.port) &&
        connection.database === this.selectedSchemaDB?.sgbd
      )
    )
  }

  private buildSchemaSelection(connection: any, database: string, schema: string): any {
    return {
      schema,
      database,
      sgbd: connection.database,
      version: connection.version,
      connectionId: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      password: connection.password,
      user: connection.user
    }
  }

  private buildDatabaseSelection(connection: any, database: any): any | null {
    const schema = database.schemas?.includes(this.selectedSchemaDB?.schema)
      ? this.selectedSchemaDB.schema
      : database.schemas?.[0]

    if (!schema) return null

    return this.buildSchemaSelection(connection, database.database, schema)
  }

  isSelectedDatabase(connection: any, database: any): boolean {
    if (!this.selectedSchemaDB) return false

    return this.isSameConnection(connection) &&
      this.selectedSchemaDB.database === database.database
  }

  isSelectedSchema(connection: any, database: string, schema: string): boolean {
    if (!this.selectedSchemaDB) return false

    return this.isSameConnection(connection) &&
      this.selectedSchemaDB.database === database &&
      this.selectedSchemaDB.schema === schema
  }

  isSelectedConnection(connection: any): boolean {
    return this.isSameConnection(connection)
  }

  private isSameConnection(connection: any): boolean {
    return this.selectedSchemaDB?.host === connection.host &&
      String(this.selectedSchemaDB?.port) === String(connection.port) &&
      this.selectedSchemaDB?.sgbd === connection.database
  }

  async canConnect(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.info || !this.dbSchemas.data) {
      this.dbSchemas = { info: [], data: [] }
    }

    const existsConnection = this.dbSchemas.data.find(
      (db: any) =>
        db.sgbd === connection.database &&
        db.host === connection.host &&
        db.port === connection.port
    )

    if (existsConnection) {
      return
    } else {
      await this.connectDatabase(connection)
    }
  }

  async connectDatabase(connection: any): Promise<void> {
    LoadingComponent.show()
    try {
      await this.IAPI.post(`/api/${connection.database}/${connection.version}/connect`, {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password
      })

      await this.disconnectDatabases(connection)
      await this.addDatabase(connection)
    } catch (error: any) {
      this.toast.showToast(error.message, 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  async disconnectDatabases(connection: any): Promise<void> {
    this.dbSchemas.data = this.dbSchemas.data.map((db: any) => {
      if (db.sgbd === connection.database) {
        return { ...db, connected: false }
      }
      return db
    })
  }

  async addDatabase(connection: any): Promise<void> {
    const schemasDb: any = await this.IAPI.get(`/api/${connection.database}/${connection.version}/list-databases-and-schemas`)

    schemasDb.data.forEach((schema: any) => {
      const exists = this.dbSchemas.data.some((db: any) =>
        db.sgbd === connection.database &&
        db.host === connection.host &&
        db.port === connection.port &&
        db.version === connection.version &&
        db.database === schema.database &&
        this.arraysEqual(db.schemas, schema.schemas)
      )

      if (!exists) {
        this.dbSchemas.data.push({
          sgbd: connection.database,
          host: connection.host,
          port: connection.port,
          version: connection.version,
          database: schema.database,
          schemas: schema.schemas,
          connected: this.dbSchemas.data.length === 0
        })
      }
    })
  }

  private arraysEqual(arr1: any[], arr2: any[]): boolean {
    if (arr1.length !== arr2.length) return false
    return arr1.every((value, index) => value === arr2[index])
  }

  private focusEventTarget(event: MouseEvent): void {
    const currentTarget = event.currentTarget as HTMLElement | null
    if (currentTarget && this.canReceiveFocus(currentTarget)) {
      currentTarget.focus({ preventScroll: true })
      return
    }

    const activeElement = document.activeElement as HTMLElement | null
    activeElement?.blur()
  }

  private canReceiveFocus(element: HTMLElement): boolean {
    return element.matches('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  }

  async selectSchema(connection: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
      return
    }

    this.clickTimeout = setTimeout(async () => {
      LoadingComponent.show()

      try {
        await this.setSchema(connection)
      } finally {
        LoadingComponent.hide()
        this.clickTimeout = null
      }
    }, 300)
  }

  async setSchema(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.data) {
      console.error('dbSchemas não está inicializado.')
      return
    }

    let schemaDb: any

    try {
      await this.canConnect({
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password,
        database: connection.sgbd,
        version: connection.version,
        id: connection.connectionId || connection.id
      })

      const matchedConnection = this.dbSchemas.data.find((db: any) =>
        db.database === connection.database &&
        db.host === connection.host &&
        db.port === connection.port &&
        db.sgbd === connection.sgbd &&
        db.version === connection.version
      )
      schemaDb = await this.connectToSchemaDb(matchedConnection, connection)

      this.selectedSchemaDB = {
        database: schemaDb?.currentSchema?.database || connection.database,
        schema: schemaDb?.currentSchema?.schema || connection.schema,
        sgbd: connection.sgbd,
        version: connection.version,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        connId: connection.connectionId || connection.id
      }

      this.dbSchemaService.setSelectedSchemaDB(this.selectedSchemaDB)
      this.selectedSchemaChanged.emit(this.selectedSchemaDB)
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.message, 'red')
      return
    }
  }

  async openSchemaDBInfo(connection: any, data2: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
    }

    this.dbInfoRequested.emit(data2 || connection)
  }

  async openDatabaseInfo(connection: any, database: any, event: MouseEvent): Promise<void> {
    event.stopPropagation()

    const schema = database.schemas.includes(this.selectedSchemaDB?.schema)
      ? this.selectedSchemaDB.schema
      : database.schemas[0]

    if (!schema) return

    const selection = this.buildSchemaSelection(connection, database.database, schema)
    await this.openSchemaDBInfo(selection, selection)
  }

  async connectToSchemaDb(connection: any, data: any | null = null): Promise<any> {
    try {
      const result: any = await this.IAPI.post(`/api/${connection.sgbd}/${connection.version}/set-schema`, {
        database: connection.database || data.database,
        schema: connection.schema || data.schema
      })

      return {
        database: connection?.database || data?.database,
        schema: connection?.schema || data?.schema
      }
    } catch (error: any) {
      this.toast.showToast(error.message, 'red')

      return null
    }
  }

  openModal() {
    this.editingConnection = null
    this.isModalOpen = true
  }

  editConnection(connection: any, event: MouseEvent): void {
    event.stopPropagation()
    this.editingConnection = connection
    this.isModalOpen = true
  }

  async closeModal() {
    this.isModalOpen = false
    this.editingConnection = null
    this.connections = this.connectionsService.getCachedConnections()
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
