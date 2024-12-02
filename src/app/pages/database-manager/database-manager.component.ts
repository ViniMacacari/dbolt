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
  databasesSchemasActiveConnections: any[] = []
  connections: any[] = []

  constructor(
    private IAPI: InternalApiService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  async ngAfterViewInit(): Promise<void> {
    LoadingComponent.show()
    await this.firstConnectionConfig()
    await this.pageConnectionConfig()
  }

  getPageId() {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    return routeParamId
  }

  async firstConnectionConfig(): Promise<void> {
    try {
      this.activeConnection = await this.IAPI.get('/api/connections/' + this.getPageId())
      console.log(this.activeConnection)
    } catch (error) {
      console.error(error)
    }
  }

  async pageConnectionConfig(): Promise<void> {
    try {
      this.connections = await this.IAPI.get('/api/connections/load')
      this.databasesSchemasActiveConnections = await this.IAPI.get(`/api/${this.activeConnection.database}/${this.activeConnection.version}/list-databases-and-schemas`)
      console.log(this.connections, this.databasesSchemasActiveConnections)
    } catch (error) {
      console.error(error)
    }
  }
}