import { Component } from '@angular/core'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { Router, ActivatedRoute } from '@angular/router'
import { SidebarComponent } from "../../components/sidebar/sidebar.component"
import { TabsComponent } from "../../components/tabs/tabs.component"
import { LoadingComponent } from '../../components/modal/loading/loading.component'

@Component({
  selector: 'app-database-manager',
  standalone: true,
  imports: [SidebarComponent, TabsComponent],
  templateUrl: './database-manager.component.html',
  styleUrl: './database-manager.component.scss'
})
export class DatabaseManagerComponent {
  activeConnection: any = {}
  databasesSchemasActiveConnections: any = []
  connections: any[] = []
  selectedSchemaDB: any

  constructor(
    private IAPI: InternalApiService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  async ngAfterViewInit(): Promise<void> {
    LoadingComponent.show()
    await this.firstConnectionConfig()
    await this.pageConnectionConfig()
    LoadingComponent.hide()
  }

  getPageId() {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    return routeParamId
  }

  async firstConnectionConfig(): Promise<void> {
    try {
      this.activeConnection = [await this.IAPI.get('/api/connections/' + this.getPageId())]
    } catch (error) {
      console.error(error)
    }
  }

  async pageConnectionConfig(): Promise<void> {
    if (!this.databasesSchemasActiveConnections) {
      this.databasesSchemasActiveConnections = { info: [], data: [] }
    }

    if (!this.databasesSchemasActiveConnections.info) {
      this.databasesSchemasActiveConnections.info = []
    }
    if (!this.databasesSchemasActiveConnections.data) {
      this.databasesSchemasActiveConnections.data = []
    }

    try {
      this.connections = await this.IAPI.get('/api/connections/load')
      console.log('Conexões carregadas:', this.connections)

      if (!this.activeConnection || !this.activeConnection[0]) {
        console.warn('Conexão ativa não definida ou inválida.')
        return
      }

      const activeConn = this.activeConnection[0]

      console.log('ativo: ', activeConn)

      const existingConnection = this.databasesSchemasActiveConnections.info.find(
        (info: any) => info.host === activeConn.host && info.port === activeConn.port
      )

      if (!existingConnection) {
        this.databasesSchemasActiveConnections.info.push({
          host: activeConn.host,
          port: activeConn.port,
          database: activeConn.database,
          name: activeConn.name,
          version: activeConn.version,
        })
      }

      const result: any = await this.IAPI.get(
        `/api/${activeConn.database}/${activeConn.version}/list-databases-and-schemas`
      )

      if (result.success && result.data) {
        result.data.forEach((db: any) => {
          const exists = this.databasesSchemasActiveConnections.data.find(
            (item: any) =>
              item.database === db.database &&
              item.host === activeConn.host &&
              item.port === activeConn.port
          )

          if (!exists) {
            this.databasesSchemasActiveConnections.data.push({
              host: activeConn.host,
              port: activeConn.port,
              version: activeConn.version,
              database: db.database,
              schemas: db.schemas,
            })
          }
        })

        console.log('Schemas carregados:', this.databasesSchemasActiveConnections)

        await this.loadInitSelectedSchemaAndDB()
      } else {
        console.error('Erro ao carregar os schemas:', result.message)
      }
    } catch (error) {
      console.error('Erro ao configurar conexão e carregar schemas:', error)
    }
  }

  async loadInitSelectedSchemaAndDB(): Promise<void> {
    const database = this.activeConnection[0].database
    const version = this.databasesSchemasActiveConnections.data[0].version
    const result: any = await this.IAPI.get(`/api/${database}/${version}/get-selected-schema`)

    this.selectedSchemaDB = {
      database: result.database,
      schema: result.schema
    }
  }
}