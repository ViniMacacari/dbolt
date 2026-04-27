import { CommonModule } from '@angular/common'
import { Component, OnInit } from '@angular/core'
import { AppSettingsService } from '../../../services/app-settings/app-settings.service'
import { ConnectionsService, SavedConnection } from '../../../services/resolve-connections/connections.service'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from '../input-list/input-list.component'
import { LoadingComponent } from '../../modal/loading/loading.component'

type SettingsTab = 'query' | 'connections'

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, InputListComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  activeTab: SettingsTab = 'query'
  defaultQueryRows: number
  connectionExpirationMinutes: number
  savedMessage: string = ''
  expirationSavedMessage: string = ''
  connectionMessage: string = ''
  connectionError: string = ''
  connections: SavedConnection[] = []
  connectionOptions: { id: number, label: string }[] = []
  selectedConnection: SavedConnection | null = null
  targetOptionsLoaded: boolean = false
  schemaOptions: any[] = []
  defaultDatabaseList: { name: string }[] = []
  defaultSchemaList: { name: string }[] = []
  selectedDefaultDatabase: string = ''
  selectedDefaultSchema: string = ''

  constructor(
    private settings: AppSettingsService,
    private connectionsService: ConnectionsService,
    private IAPI: InternalApiService
  ) {
    this.defaultQueryRows = this.settings.getDefaultQueryRows()
    this.connectionExpirationMinutes = this.settings.getConnectionExpirationMinutes()
  }

  async ngOnInit(): Promise<void> {
    await this.loadConnections()
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab = tab
  }

  get settingsTitle(): string {
    return this.activeTab === 'connections' ? 'Connections' : 'Query defaults'
  }

  get requiresDefaultDatabase(): boolean {
    return ['MySQL', 'Postgres', 'SqlServer'].includes(this.selectedConnection?.database || '')
  }

  get requiresDefaultSchema(): boolean {
    return ['Hana', 'Postgres', 'SqlServer'].includes(this.selectedConnection?.database || '')
  }

  get currentDefaultTarget(): string {
    if (!this.selectedConnection?.defaultDatabase && !this.selectedConnection?.defaultSchema) {
      return 'No default target selected'
    }

    return [
      this.selectedConnection.defaultDatabase,
      this.selectedConnection.defaultSchema
    ].filter(Boolean).join(' / ')
  }

  onDefaultRowsInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.defaultQueryRows = Math.max(1, Math.floor(value))
    this.savedMessage = ''
  }

  saveDefaultRows(): void {
    const settings = this.settings.setDefaultQueryRows(this.defaultQueryRows)
    this.defaultQueryRows = settings.defaultQueryRows
    this.savedMessage = 'Saved'
  }

  onConnectionExpirationInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.connectionExpirationMinutes = Math.max(1, Math.floor(value))
    this.expirationSavedMessage = ''
  }

  saveConnectionExpiration(): void {
    const settings = this.settings.setConnectionExpirationMinutes(this.connectionExpirationMinutes)
    this.connectionExpirationMinutes = settings.connectionExpirationMinutes
    this.expirationSavedMessage = 'Saved'
  }

  onConnectionSelected(item: { [key: string]: string | number } | null): void {
    this.connectionMessage = ''
    this.connectionError = ''
    this.targetOptionsLoaded = false
    this.schemaOptions = []
    this.defaultDatabaseList = []
    this.defaultSchemaList = []

    if (!item) {
      this.selectedConnection = null
      this.selectedDefaultDatabase = ''
      this.selectedDefaultSchema = ''
      return
    }

    this.selectedConnection = this.connections.find((connection) => connection.id === Number(item['id'])) || null
    this.selectedDefaultDatabase = this.selectedConnection?.defaultDatabase || ''
    this.selectedDefaultSchema = this.selectedConnection?.defaultSchema || ''
  }

  async loadConnectionTargets(): Promise<void> {
    if (!this.selectedConnection) return

    LoadingComponent.show('Loading available databases...')
    this.connectionMessage = ''
    this.connectionError = ''

    try {
      const connectionKey = `settings-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const connectionResult: any = await this.IAPI.post(
        `/api/${this.selectedConnection.database}/${this.selectedConnection.version}/connect`,
        {
          host: this.selectedConnection.host,
          port: this.selectedConnection.port,
          user: this.selectedConnection.user,
          password: this.selectedConnection.password,
          connectionKey
        }
      )

      if (connectionResult?.success === false) {
        throw new Error(connectionResult.error || connectionResult.message || 'Connection failed')
      }

      const response: any = await this.IAPI.get(
        `/api/${this.selectedConnection.database}/${this.selectedConnection.version}/list-databases-and-schemas?connectionKey=${encodeURIComponent(connectionKey)}`
      )

      if (response?.success === false) {
        throw new Error(response.error || response.message || 'Could not load databases and schemas.')
      }

      this.schemaOptions = response.data || []
      this.defaultDatabaseList = this.schemaOptions.map((item: any) => ({ name: item.database }))

      if (!this.requiresDefaultDatabase && this.schemaOptions[0]) {
        this.selectedDefaultDatabase = this.schemaOptions[0].database
      }

      this.refreshSchemaList()
      this.targetOptionsLoaded = true
    } catch (error: any) {
      console.error(error)
      this.connectionError = error?.error || error?.message || 'Could not load databases and schemas.'
    } finally {
      LoadingComponent.hide()
    }
  }

  onDefaultDatabaseSelected(item: { [key: string]: string | number } | null): void {
    this.selectedDefaultDatabase = item?.['name']?.toString() || ''
    this.selectedDefaultSchema = ''
    this.refreshSchemaList()
  }

  onDefaultSchemaSelected(item: { [key: string]: string | number } | null): void {
    this.selectedDefaultSchema = item?.['name']?.toString() || ''
  }

  async saveConnectionTarget(): Promise<void> {
    if (!this.selectedConnection) return

    LoadingComponent.show('Saving connection defaults...')

    try {
      this.validateSelectedTarget()

      const updatedConnection = await this.connectionsService.updateConnection(this.selectedConnection.id, {
        name: this.selectedConnection.name,
        database: this.selectedConnection.database,
        version: this.selectedConnection.version,
        host: this.selectedConnection.host,
        port: this.selectedConnection.port,
        user: this.selectedConnection.user,
        password: this.selectedConnection.password,
        defaultDatabase: this.requiresDefaultDatabase ? this.selectedDefaultDatabase || undefined : undefined,
        defaultSchema: this.requiresDefaultSchema ? this.selectedDefaultSchema || undefined : undefined
      })

      this.selectedConnection = updatedConnection
      await this.loadConnections()
      this.connectionMessage = 'Saved'
      this.connectionError = ''
    } catch (error: any) {
      console.error(error)
      this.connectionMessage = ''
      this.connectionError = error?.error || error?.message || 'Could not save connection defaults.'
    } finally {
      LoadingComponent.hide()
    }
  }

  async clearConnectionTarget(): Promise<void> {
    if (!this.selectedConnection) return

    this.selectedDefaultDatabase = ''
    this.selectedDefaultSchema = ''
    await this.saveConnectionTarget()
  }

  private async loadConnections(): Promise<void> {
    this.connections = await this.connectionsService.loadConnections()
    this.connectionOptions = this.connections.map((connection) => ({
      id: connection.id,
      label: `${connection.name} (${connection.database})`
    }))
  }

  private refreshSchemaList(): void {
    const selectedDatabase = this.requiresDefaultDatabase
      ? this.selectedDefaultDatabase
      : this.schemaOptions[0]?.database

    const databaseInfo = this.schemaOptions.find((item: any) => item.database === selectedDatabase)
    this.defaultSchemaList = (databaseInfo?.schemas || []).map((schema: string) => ({ name: schema }))
  }

  private validateSelectedTarget(): void {
    if (!this.targetOptionsLoaded && (this.selectedDefaultDatabase || this.selectedDefaultSchema)) {
      throw new Error('Load available databases before saving a default target.')
    }

    if (this.requiresDefaultDatabase && this.selectedDefaultDatabase) {
      const databaseExists = this.defaultDatabaseList.some((database) => database.name === this.selectedDefaultDatabase)
      if (!databaseExists) {
        throw new Error('Selected default database does not exist.')
      }
    }

    if (this.requiresDefaultSchema && this.selectedDefaultSchema) {
      const schemaExists = this.defaultSchemaList.some((schema) => schema.name === this.selectedDefaultSchema)
      if (!schemaExists) {
        throw new Error('Selected default schema does not exist.')
      }
    }
  }
}
