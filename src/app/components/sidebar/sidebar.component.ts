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
  @Input() selectedSchemaDB: any

  @ViewChild('toast') toast!: ToastComponent

  isModalOpen: boolean = false
  isOpen = true
  expandedConnections: Set<string> = new Set()
  expandedDatabases: Set<string> = new Set()
  clickTimeout: any = null

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
      (info: any) =>
        info.host === connection.host &&
        info.port === connection.port &&
        info.sgbd === connection.sgbd
    )

    if (existingConnection) return

    this.dbSchemas.data.forEach((item: any) => {
      item.connected = false
    })

    LoadingComponent.show()

    try {
      this.dbSchemas.info.push({
        host: connection.host,
        port: connection.port,
        sgbd: connection.sgbd,
        name: connection.name
      })

      await this.IAPI.post(`/api/${connection.sgbd}/${connection.version}/connect`, {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password
      })

      const response: any = await this.IAPI.get(
        `/api/${connection.sgbd}/${connection.version}/list-databases-and-schemas`
      )

      if (response && response.data) {
        response.data.forEach((db: any, index: number) => {
          const exists = this.dbSchemas.data.find(
            (item: any) =>
              item.database === db.database &&
              item.host === connection.host &&
              item.port === connection.port &&
              item.sgbd === connection.sgbd
          )

          if (!exists) {
            this.dbSchemas.data.push({
              host: connection.host,
              port: connection.port,
              database: db.database,
              schemas: db.schemas,
              sgbd: connection.sgbd,
              connected: index === 0
            })
          }
        })

        const firstDB = this.dbSchemas.data.find((db: any) => db.connected)

        if (firstDB) {
          await this.selectSchema({
            database: firstDB.database,
            schema: firstDB.schemas[0],
            sgbd: firstDB.sgbd,
            version: connection.version
          })
        }
      }
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.message, 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  async selectSchema(connection: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
    }

    LoadingComponent.show()

    try {
      console.log('Verificando conexão...')
      console.log('connection:', connection)
      console.log('dbSchemas.data:', this.dbSchemas.data)

      console.log('Comparando:')
      console.log('Connection Host:', connection.host, '| Data Host:', this.dbSchemas.data.map((d: any) => d.host))
      console.log('Connection Port:', connection.port, '| Data Port:', this.dbSchemas.data.map((d: any) => d.port))
      console.log('Connection Database:', connection.database, '| Data Database:', this.dbSchemas.data.map((d: any) => d.database))
      console.log('Connection Version:', connection.version, '| Data Version:', this.dbSchemas.data.map((d: any) => d.version))
      console.log('Connection Connected:', this.dbSchemas.data.map((d: any) => d.connected))

      const existingConnection = this.dbSchemas.data.find(
        (item: any) =>
          item.database === connection.database &&
          item.host === connection.connectionHost && // Ajuste: connection.connectionHost
          item.port === connection.connectionPort && // Ajuste: connection.connectionPort
          item.version === connection.version &&
          item.connected === true
      )

      console.log('Existing Connection:', existingConnection)

      if (existingConnection) {
        console.log('Conexão já ativa. Pulando nova conexão.')
      } else {
        console.log('Conexão não encontrada ou inativa. Tentando conectar...')
        const payload = {
          host: connection.host,
          port: connection.port,
          user: connection.user || '',
          password: connection.password || ''
        }
        console.log('Payload para conexão:', payload)

        const response: any = await this.IAPI.post(`/api/${connection.sgbd}/${connection.version}/connect`, payload)

        if (!response || !response.success) {
          console.error('Erro na tentativa de conexão:', response)
          throw new Error('Falha ao conectar com a configuração fornecida')
        }

        console.log('Conexão bem-sucedida. Atualizando estado...')
        this.dbSchemas.data.forEach((item: any) => item.connected = false)

        const updatedConnection = this.dbSchemas.data.find(
          (item: any) =>
            item.database === connection.database &&
            item.host === connection.host &&
            item.port === connection.port &&
            item.version === connection.version &&
            item.sgbd === connection.sgbd
        )

        if (updatedConnection) updatedConnection.connected = true
        console.log('Estado atualizado:', this.dbSchemas.data)
      }

      console.log('Selecionando schema...')
      const schemaPayload = {
        database: connection.database || '',
        schema: connection.schema || ''
      }
      console.log('Payload para schema:', schemaPayload)

      await this.IAPI.post(`/api/${connection.sgbd}/${connection.version}/set-schema`, schemaPayload)

      const result: any = await this.IAPI.get(`/api/${connection.sgbd}/${connection.version}/get-selected-schema`)

      this.selectedSchemaDB = {
        database: result.database,
        schema: result.schema
      }

      console.log('Schema selecionado com sucesso:', this.selectedSchemaDB)
    } catch (error: any) {
      console.error('Erro ao selecionar schema:', error)
      this.toast.showToast(error.message, 'red')
    } finally {
      LoadingComponent.hide()
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