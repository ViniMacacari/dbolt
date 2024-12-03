import { Component, HostListener } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router, ActivatedRoute } from '@angular/router'
import { InputListComponent } from "../elements/input-list/input-list.component"
import { InternalApiService } from '../../services/requests/internal-api.service'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent {
  dataList: any = []
  dropdownVisible: boolean = false

  constructor(
    private route: ActivatedRoute,
    private IAPI: InternalApiService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    const database = await this.IAPI.get(`/api/connections/${routeParamId}`)
  }

  toggleDropdown(): void {
    this.dropdownVisible = !this.dropdownVisible
  }

  newQuery(): void {
    console.log('Opção 1 selecionada')
    this.dropdownVisible = false
  }

  loadQuery(): void {
    console.log('Opção 2 selecionada')
    this.dropdownVisible = false
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const targetElement = event.target as HTMLElement
    if (!targetElement.closest('.add')) {
      this.dropdownVisible = false
    }
  }
}