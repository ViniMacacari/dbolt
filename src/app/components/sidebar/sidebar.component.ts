import { Component, Input, ChangeDetectorRef, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'
import { ToastComponent } from '../toast/toast.component'
import { EditConnectionComponent } from "../modal/edit-connection/edit-connection.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
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
    private cdr: ChangeDetectorRef,
    private dbSchemaService: GetDbschemaService
  ) { }

  toggle() {
    this.isOpen = !this.isOpen
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
  }

  async selectSchema(connection: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
    }

    LoadingComponent.show()

    this.clickTimeout = setTimeout(async () => {
      await this.setSchema(connection)

      LoadingComponent.hide()
    }, 300)
  }

  async setSchema(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.data) {
      console.error('dbSchemas não está inicializado.')
      return
    }

    const matchedConnection = this.dbSchemas.data.find((db: any) =>
      db.database === connection.database &&
      db.host === connection.host &&
      db.port === connection.port &&
      db.sgbd === connection.sgbd &&
      db.version === connection.version
    )

    if (matchedConnection) {
      if (matchedConnection.connected) {
        let schemaDb: any

        try {
          schemaDb = await this.connectToSchemaDb(matchedConnection, connection)
        } catch (error: any) {
          console.error(error)
          this.toast.showToast(error.message, 'red')
          return
        }

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

      } else {
        try {
          try {
            await this.IAPI.post(`/api/${connection.sgbd}/${connection.version}/connect`, {
              host: connection.host,
              port: connection.port,
              user: connection.user,
              password: connection.password
            })

            this.expandedConnections.add(connection.id)

            await this.disconnectDatabases(connection)

            this.dbSchemas.data = this.dbSchemas.data.map((db: any) => {
              if (db.sgbd === connection.sgbd) {
                if (
                  db.database === connection.database &&
                  db.host === connection.host &&
                  db.port === connection.port &&
                  db.version === connection.version
                ) {
                  return { ...db, connected: true }
                } else {
                  this.disconnectDatabases(db)
                  return { ...db, connected: false }
                }
              }
              return db
            })

          } catch (error: any) {
            this.toast.showToast(error.message, 'red')
          }

          const schemaDb: any = await this.connectToSchemaDb(connection)

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
          this.toast.showToast(error.message, 'red')
        }
      }
    } else {
      this.toast.showToast('No connection found', 'red')
    }
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

  async openSchemaDBInfo(connection: any): Promise<any> {
    console.log('Clique duplo: ', connection)

    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
    }
  }

  openModal() {
    this.isModalOpen = true
  }

  async closeModal() {
    this.isModalOpen = false
  }
}