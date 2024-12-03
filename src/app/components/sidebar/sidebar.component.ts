import { Component, Input, ChangeDetectorRef, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'
import { ToastComponent } from '../toast/toast.component'
import { EditConnectionComponent } from "../modal/edit-connection/edit-connection.component"

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, ToastComponent, EditConnectionComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() connections: any[] = []
  @Input() activeConnection: any = { info: {}, data: [] }
  @Input() dbSchemas: any = []

  @ViewChild('toast') toast!: ToastComponent

  isModalOpen: boolean = false
  isOpen = true
  expandedConnections: Set<string> = new Set()
  expandedDatabases: Set<string> = new Set()

  constructor(
    private IAPI: InternalApiService,
    private cdr: ChangeDetectorRef
  ) { }

  toggle() {
    this.isOpen = !this.isOpen
  }

  toggleConnection(connection: string) {
    if (this.expandedConnections.has(connection)) {
      this.expandedConnections.delete(connection)
    } else {
      this.expandedConnections.add(connection)
    }
  }

  toggleDatabase(database: string) {
    if (this.expandedDatabases.has(database)) {
      this.expandedDatabases.delete(database)
    } else {
      this.expandedDatabases.add(database)
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
        item.host === connection.host && item.port === connection.port
    )
  }

  async connectDatabase(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.info || !this.dbSchemas.data) {
      this.dbSchemas = { info: [], data: [] }
    }

    const existingConnection = this.dbSchemas.info.find(
      (info: any) => info.host === connection.host && info.port === connection.port
    )

    if (existingConnection) return

    LoadingComponent.show()

    try {
      this.dbSchemas.info.push({
        host: connection.host,
        port: connection.port,
        database: connection.database,
        name: connection.name,
      })

      await this.IAPI.post(`/api/${connection.database}/${connection.version}/connect`, {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password,
      })

      const response: any = await this.IAPI.get(
        `/api/${connection.database}/${connection.version}/list-databases-and-schemas`
      )

      if (response && response.data) {
        response.data.forEach((db: any) => {
          const exists = this.dbSchemas.data.find(
            (item: any) =>
              item.database === db.database &&
              item.host === connection.host &&
              item.port === connection.port
          )

          if (!exists) {
            this.dbSchemas.data.push({
              host: connection.host,
              port: connection.port,
              database: db.database,
              schemas: db.schemas,
            })
          }
        })
      }
      console.log('dbSchemas atualizado:', this.dbSchemas)

      LoadingComponent.hide()
    } catch (error: any) {
      console.error(error)
      LoadingComponent.hide()
      this.toast.showToast(error.message, 'red')
    }
  }

  async selectSchema(connection: any, schema: any): Promise<any> {
    console.log(connection, schema)
  }

  openModal() {
    this.isModalOpen = true
  }

  async closeModal() {
    this.isModalOpen = false
  }
}