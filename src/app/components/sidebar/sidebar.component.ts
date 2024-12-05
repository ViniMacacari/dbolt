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
    console.log(connection)
    LoadingComponent.show()
    try {
      await this.IAPI.post(`/api/${connection.database}/${connection.version}/connect`, {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password
      })
    } catch (error: any) {
      this.toast.showToast(error.message, 'red')
    } finally {
      LoadingComponent.hide()
    }
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