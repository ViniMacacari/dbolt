import { Component, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { ConnectionComponent } from "../../components/modal/connection/connection.component"
import { ToastComponent } from '../../components/toast/toast.component'
import { LoadingComponent } from '../../components/modal/loading/loading.component'
import { ConnectionsService } from '../../services/resolve-connections/connections.service'

type ConnectionViewMode = 'focus' | 'matrix'

@Component({
  selector: 'app-open-page',
  standalone: true,
  imports: [
    CommonModule,
    ConnectionComponent,
    ToastComponent
  ],
  templateUrl: './open-page.component.html',
  styleUrl: './open-page.component.scss'
})
export class OpenPageComponent {
  isModalOpen = false
  editingConnection: any = null
  connections: any[] = []
  viewMode: ConnectionViewMode = 'focus'
  selectedConnectionId: number | null = null
  appVersion: string = ''

  private readonly viewModeStorageKey = 'dbolt-home-view-mode'

  @ViewChild('toast') toast!: ToastComponent

  constructor(
    private IAPI: InternalApiService,
    private router: Router,
    private connectionsService: ConnectionsService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    this.viewMode = this.getStoredViewMode()
    LoadingComponent.show('Loading saved connections...')

    try {
      await this.getConfigurations()
      await this.loadAppInfo()
      await this.loadConnections()
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.message || 'Error loading saved connections', 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  async getConfigurations(): Promise<void> {

  }

  openModal() {
    this.editingConnection = null
    this.isModalOpen = true
  }

  async closeModal() {
    await this.loadConnections()
    this.isModalOpen = false
    this.editingConnection = null
  }

  async loadConnections(): Promise<void> {
    this.connections = await this.connectionsService.loadConnections()
    if (!this.selectedConnectionId && this.connections[0]) {
      this.selectedConnectionId = this.connections[0].id
    }
  }

  async loadAppInfo(): Promise<void> {
    try {
      const appInfo = await this.IAPI.get<{ version: string }>('/api/app-info')
      this.appVersion = appInfo.version
    } catch (error) {
      console.warn('Could not load app version:', error)
      this.appVersion = ''
    }
  }

  setViewMode(viewMode: ConnectionViewMode): void {
    this.viewMode = viewMode
    localStorage.setItem(this.viewModeStorageKey, viewMode)
  }

  selectConnection(connection: any): void {
    this.selectedConnectionId = connection.id
  }

  get selectedConnection(): any {
    return this.connections.find((connection) => connection.id === this.selectedConnectionId) || this.connections[0]
  }

  get selectedTarget(): string {
    const connection = this.selectedConnection
    return [connection?.defaultDatabase, connection?.defaultSchema].filter(Boolean).join(' / ') || 'No default target'
  }

  openSelectedConnection(): void {
    const connection = this.selectedConnection
    if (!connection) return

    void this.onCardClick(connection.id)
  }

  trackConnectionById(index: number, connection: any): number {
    return connection.id ?? index
  }

  async onCardClick(id: number): Promise<void> {
    LoadingComponent.show()
    try {
      const result: any = await this.connectionsService.getConnectionById(id)
      const connectionResult: any = await this.IAPI.post(`/api/${result.database}/${result.version}/connect`, {
        host: result.host,
        port: result.port,
        user: result.user,
        password: result.password
      })

      if (connectionResult?.success === false) {
        throw new Error(connectionResult.error || connectionResult.message || 'Connection failed')
      }

      if (result.defaultDatabase || result.defaultSchema) {
        const schemaResult: any = await this.IAPI.post(`/api/${result.database}/${result.version}/set-schema`, {
          database: result.defaultDatabase,
          schema: result.defaultSchema
        })

        if (schemaResult?.success === false) {
          throw new Error(schemaResult.error || schemaResult.message || 'Could not apply default database/schema')
        }
      }

      LoadingComponent.hide()
      this.router.navigate([`/database-management/${id}`])
    } catch (error) {
      console.error(error)
      LoadingComponent.hide()
      this.toast.showToast('Connection failed', 'red')
    }
  }

  async deleteConnection(id: number, event: MouseEvent): Promise<void> {
    event.stopPropagation()
    await this.connectionsService.deleteConnection(id)
    this.connections = this.connectionsService.getCachedConnections()
  }

  editConnection(connection: any, event: MouseEvent): void {
    event.stopPropagation()
    this.editingConnection = connection
    this.isModalOpen = true
  }

  private getStoredViewMode(): ConnectionViewMode {
    const storedViewMode = localStorage.getItem(this.viewModeStorageKey)
    return storedViewMode === 'focus' || storedViewMode === 'matrix'
      ? storedViewMode
      : 'focus'
  }
}
