import { Component, Input, ChangeDetectorRef, ViewChild, EventEmitter, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'
import { ToastComponent } from '../toast/toast.component'
import { EditConnectionComponent } from "../modal/edit-connection/edit-connection.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { connect } from 'rxjs'
import { version } from 'sortablejs'

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
  @Output() sidebarStatusChange = new EventEmitter<boolean>()
  @Output() dbInfoRequested = new EventEmitter<any>()

  @ViewChild('toast') toast!: ToastComponent

  isModalOpen: boolean = false
  isOpen = true
  expandedConnections: Set<number> = new Set()
  expandedDatabases: Set<string> = new Set()
  clickTimeout: any = null

  constructor(
    private IAPI: InternalApiService,
    private cdr: ChangeDetectorRef,
    private dbSchemaService: GetDbschemaService
  ) { }

  toggle() {
    this.isOpen = !this.isOpen
    this.sidebarStatusChange.emit(this.isOpen)
  }

  toggleConnection(connectionId: number) {
    if (this.expandedConnections.has(connectionId)) {
      this.expandedConnections.delete(connectionId)
    } else {
      this.expandedConnections.add(connectionId)
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

  async selectSchema(connection: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
      return
    }

    this.clickTimeout = setTimeout(async () => {
      LoadingComponent.show()

      await this.setSchema(connection)

      LoadingComponent.hide()

      this.clickTimeout = null
    }, 300)
  }

  async setSchema(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.data) {
      console.error('dbSchemas não está inicializado.')
      return
    }

    let schemaDb: any

    try {
      await this.connectDatabase({
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password,
        database: connection.sgbd,
        version: connection.version
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
        connId: connection.id
      }

      this.dbSchemaService.setSelectedSchemaDB(this.selectedSchemaDB)
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

      return
    }

    LoadingComponent.show()

    await this.setSchema(data2)
    this.dbInfoRequested.emit(connection)

    LoadingComponent.hide()

    this.clickTimeout = setTimeout(() => {
      this.clickTimeout = null
    }, 300)
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
    this.isModalOpen = true
  }

  async closeModal() {
    this.isModalOpen = false
  }
}