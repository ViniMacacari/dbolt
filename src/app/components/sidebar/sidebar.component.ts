import { Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() connections: any[] = []
  @Input() activeConnection: any = { info: {}, data: [] }
  @Input() dbSchemas: any = []

  isOpen = true
  expandedConnections: Set<string> = new Set()
  expandedDatabases: Set<string> = new Set()

  constructor(private IAPI: InternalApiService) { }

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

  async connectDatabase(connection: any): Promise<void> {
    try {
      const dbConnection = this.dbSchemas.find(
        (dbConn: any) =>
          dbConn.connection.host === connection.host &&
          dbConn.connection.port === connection.port
      )

      if (dbConnection && dbConnection.schemas?.length) {
        console.log(`Schemas already loaded for ${connection.name}`)
        return
      }

      LoadingComponent.show()

      const result: any = await this.IAPI.get(
        `/api/${connection.database}/${connection.version}/list-databases-and-schemas`
      )

      if (result.success) {
        if (dbConnection) {
          dbConnection.schemas = result.data
        } else {
          this.dbSchemas.push({
            connection,
            schemas: result.data
          })
        }
        console.log(`Schemas loaded for ${connection.name}`, result.data)
      } else {
        console.error(`Failed to load schemas for ${connection.name}:`, result.message)
      }
    } catch (error) {
      console.error(`Error connecting to ${connection.name}:`, error)
    } finally {
      LoadingComponent.hide()
    }
  }
}