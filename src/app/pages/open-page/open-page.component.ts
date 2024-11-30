import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { ConnectionComponent } from "../../components/modal/connection/connection.component"

@Component({
  selector: 'app-open-page',
  standalone: true,
  imports: [
    CommonModule,
    ConnectionComponent
  ],
  templateUrl: './open-page.component.html',
  styleUrl: './open-page.component.scss'
})
export class OpenPageComponent {
  isModalOpen = false
  connections: any[] = []

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
    console.log('Abrindo modal')
    this.isModalOpen = true
  }

  async closeModal() {
    await this.loadConnections()
    this.isModalOpen = false
  }

  async loadConnections(): Promise<void> {
    this.connections = await this.IAPI.get('/api/connections/load')
    console.log(this.connections)
  }

  async onCardClick(id: number): Promise<void> {
    this.router.navigate([`/database-management/${id}`])
  }

  async deleteConnection(id: number): Promise<void> {
    await this.IAPI.delete(`/api/connections/${id}`)
    await this.loadConnections()
  }
}