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
    try {
      this.connections = await this.IAPI.get('/api/connections/load')
      console.log(this.connections)
      const result: any = await this.IAPI.get(`/api/${this.activeConnection[0].database}/${this.activeConnection[0].version}/list-databases-and-schemas`)

      this.databasesSchemasActiveConnections = Object.assign(
        { info: this.activeConnection },
        { data: result.data }
      )
    } catch (error) {
      console.error(error)
    }
  }
}