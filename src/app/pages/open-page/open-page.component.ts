import { Component, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { ConnectionComponent } from "../../components/modal/connection/connection.component"
import { ToastComponent } from '../../components/toast/toast.component'
import { LoadingComponent } from '../../components/modal/loading/loading.component'

@Component({
  selector: 'app-open-page',
  standalone: true,
  imports: [
    CommonModule,
    ConnectionComponent,
    ToastComponent
  ],
  templateUrl: './open-page.component.html',
  styleUrl: './open-page.component.scss'
})
export class OpenPageComponent {
  isModalOpen = false
  connections: any[] = []

  @ViewChild('toast') toast!: ToastComponent

  constructor(
    private IAPI: InternalApiService,
    private router: Router
  ) { }

  async ngAfterViewInit(): Promise<void> {
    this.getConfigurations()
    await this.loadConnections()
  }

  async getConfigurations(): Promise<void> {

  }

  openModal() {
    this.isModalOpen = true
  }

  async closeModal() {
    await this.loadConnections()
    this.isModalOpen = false
  }

  async loadConnections(): Promise<void> {
    this.connections = await this.IAPI.get('/api/connections/load')
  }

  async onCardClick(id: number): Promise<void> {
    LoadingComponent.show()
    try {
      const result: any = await this.IAPI.get(`/api/connections/${id}`)
      console.log(result)
      await this.IAPI.post(`/api/${result.database}/${result.version}/connect`, result)
      LoadingComponent.hide()
      this.router.navigate([`/database-management/${id}`])
    } catch (error) {
      console.error(error)
      LoadingComponent.hide()
      this.toast.showToast('Connection failed', 'red')
    }
  }

  async deleteConnection(id: number): Promise<void> {
    await this.IAPI.delete(`/api/connections/${id}`)
    await this.loadConnections()
  }
}