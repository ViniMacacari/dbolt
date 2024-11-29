import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgOptimizedImage } from '@angular/common'
import { ConnectionComponent } from "../../components/modal/connection/connection.component"
import { InternalApiService } from '../../services/requests/internal-api.service'

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

  constructor(
    private IAPI: InternalApiService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    this.getConfigurations()
  }

  async getConfigurations(): Promise<void> {
    
  }

  openModal() {
    console.log('Abrindo modal')
    this.isModalOpen = true
  }

  closeModal() {
    console.log('Fechando modal')
    this.isModalOpen = false
  }
}