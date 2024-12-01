import { Component } from '@angular/core'
import { Router, ActivatedRoute } from '@angular/router'
import { InputListComponent } from "../elements/input-list/input-list.component"
import { InternalApiService } from '../../services/requests/internal-api.service'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [InputListComponent],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent {
  dataList: any = []

  constructor(
    private route: ActivatedRoute,
    private IAPI: InternalApiService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    const database = await this.IAPI.get(`/api/connections/${routeParamId}`)
    
  }
}
