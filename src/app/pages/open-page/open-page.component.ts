import { Component, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { ConnectionComponent } from "../../components/modal/connection/connection.component"
import { ToastComponent } from '../../components/toast/toast.component'
import { LoadingComponent } from '../../components/modal/loading/loading.component'
import { ConnectionsService } from '../../services/resolve-connections/connections.service'
import { AppLanguageService } from '../../services/language/app-language.service'
import { AppLanguage } from '../../services/language/language.model'

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
  connectionSearch = ''
  selectedConnectionId: number | null = null
  appVersion: string = ''
  appLanguage: AppLanguage
  readonly appLanguageOptions: { value: AppLanguage, label: string }[]
  isLanguageModalOpen = false

  @ViewChild('toast') toast!: ToastComponent

  constructor(
    private IAPI: InternalApiService,
    private router: Router,
    private connectionsService: ConnectionsService,
    private language: AppLanguageService
  ) {
    this.appLanguage = this.language.getCurrentLanguage()
    this.appLanguageOptions = this.language.languageOptions
  }

  async ngAfterViewInit(): Promise<void> {
    LoadingComponent.show(this.t('home.loadingConnections'))

    try {
      await this.getConfigurations()
      await this.loadAppInfo()
      await this.loadConnections()
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.message || this.t('home.loadConnectionsError'), 'red')
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

  openHelp(): void {
    this.router.navigate(['/help'])
  }

  openLanguageModal(): void {
    this.isLanguageModalOpen = true
  }

  closeLanguageModal(): void {
    this.isLanguageModalOpen = false
  }

  selectLanguage(language: AppLanguage): void {
    this.appLanguage = this.language.setLanguage(language)
    this.closeLanguageModal()
  }

  async closeModal() {
    await this.loadConnections()
    this.isModalOpen = false
    this.editingConnection = null
  }

  async loadConnections(): Promise<void> {
    this.connections = await this.connectionsService.loadConnections()
    if (!this.connections.some((connection) => connection.id === this.selectedConnectionId)) {
      this.selectedConnectionId = this.connections[0]?.id ?? null
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

  get filteredConnections(): any[] {
    const search = this.connectionSearch.trim().toLocaleLowerCase()
    if (!search) return this.connections

    return this.connections.filter((connection) => [
      connection.name,
      connection.database,
      connection.databaseVersion,
      connection.host,
      connection.defaultDatabase,
      connection.defaultSchema
    ].some((value) => String(value || '').toLocaleLowerCase().includes(search)))
  }

  onConnectionSearch(event: Event): void {
    this.connectionSearch = (event.target as HTMLInputElement).value
  }

  selectConnection(connection: any): void {
    this.selectedConnectionId = connection.id
  }

  get selectedConnection(): any {
    return this.connections.find((connection) => connection.id === this.selectedConnectionId) || this.connections[0]
  }

  getConnectionTarget(connection: any): string {
    return [connection?.defaultDatabase, connection?.defaultSchema].filter(Boolean).join(' / ') ||
      this.t('home.noDefaultTarget')
  }

  get selectedTarget(): string {
    return this.getConnectionTarget(this.selectedConnection)
  }

  openSelectedConnection(): void {
    if (this.selectedConnection) {
      void this.onCardClick(this.selectedConnection.id)
    }
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
        throw new Error(connectionResult.error || connectionResult.message || this.t('home.connectionFailed'))
      }

      if (result.defaultDatabase || result.defaultSchema) {
        const schemaResult: any = await this.IAPI.post(`/api/${result.database}/${result.version}/set-schema`, {
          database: result.defaultDatabase,
          schema: result.defaultSchema
        })

        if (schemaResult?.success === false) {
          throw new Error(schemaResult.error || schemaResult.message || this.t('home.applyDefaultTargetError'))
        }
      }

      LoadingComponent.hide()
      this.router.navigate([`/database-management/${id}`])
    } catch (error) {
      console.error(error)
      LoadingComponent.hide()
      this.toast.showToast(this.t('home.connectionFailed'), 'red')
    }
  }

  async deleteConnection(id: number, event: MouseEvent): Promise<void> {
    event.stopPropagation()
    await this.connectionsService.deleteConnection(id)
    this.connections = this.connectionsService.getCachedConnections()
    if (!this.connections.some((connection) => connection.id === this.selectedConnectionId)) {
      this.selectedConnectionId = this.connections[0]?.id ?? null
    }
  }

  editConnection(connection: any, event: MouseEvent): void {
    event.stopPropagation()
    this.editingConnection = connection
    this.isModalOpen = true
  }

  t(key: string): string {
    return this.language.translate(key)
  }
}
