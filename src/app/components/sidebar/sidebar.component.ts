import { Component, Input, ChangeDetectorRef, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'
import { ToastComponent } from '../toast/toast.component'
import { EditConnectionComponent } from "../modal/edit-connection/edit-connection.component"
import { connect } from 'rxjs'

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
  @Input() selectedSchemaDB: any

  @ViewChild('toast') toast!: ToastComponent

  isModalOpen: boolean = false
  isOpen = true
  expandedConnections: Set<number> = new Set()
  expandedDatabases: Set<string> = new Set()
  clickTimeout: any = null

  constructor(
    private IAPI: InternalApiService,
    private cdr: ChangeDetectorRef
  ) { }

  toggle() {
    this.isOpen = !this.isOpen
  }

  toggleConnection(connectionId: number) {
    console.log('Conexão clicada:', connectionId)
    if (this.expandedConnections.has(connectionId)) {
      this.expandedConnections.delete(connectionId)
    } else {
      this.expandedConnections.add(connectionId)
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
      this.connectDatabase(connection)
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

      this.expandedConnections.add(connection.id)

      await this.disconnectDatabases(connection)
      await this.addDatabase(connection)
    } catch (error: any) {
      this.toast.showToast(error.message, 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  async disconnectDatabases(connection: any): Promise<void> {
    console.log('Conexão para desconectar:', connection)

    this.dbSchemas.data = this.dbSchemas.data.map((db: any) => {
      if (db.sgbd === connection.database) {
        return { ...db, connected: false }
      }
      return db
    })
  }

  async addDatabase(connection: any): Promise<void> {
    console.log(connection)
    console.log('aqui: ', this.dbSchemas.data)

    const schemasDb: any = await this.IAPI.get(`/api/${connection.database}/${connection.version}/list-databases-and-schemas`)

    console.log('schemas', schemasDb)

    schemasDb.data.forEach((schema: any, index: number) => {
      this.dbSchemas.data.push({
        sgbd: connection.database,
        host: connection.host,
        port: connection.port,
        version: connection.version,
        database: schema.database,
        schemas: schema.schemas,
        connected: index === 0
      })
    })

    console.log('atualizado: ', this.dbSchemas)
  }

  async selectSchema(connection: any): Promise<any> {
    console.log('setando para receber: ', connection)

    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
    }
  }

  async openSchemaDBInfo(connection: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
    }

    this.clickTimeout = setTimeout(() => {
      console.log('Clique simples:', connection)
    }, 300)
  }

  openModal() {
    this.isModalOpen = true
  }

  async closeModal() {
    this.isModalOpen = false
  }
}