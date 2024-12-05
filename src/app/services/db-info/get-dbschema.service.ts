import { Injectable } from '@angular/core'
import { SidebarComponent } from '../../components/sidebar/sidebar.component'

@Injectable({
  providedIn: 'root'
})
export class GetDbschemaService {
  constructor(private sidebarComponent: SidebarComponent) { }

  getSelectedSchemaDB(): any {
    return this.sidebarComponent.selectedSchemaDB
  }
}