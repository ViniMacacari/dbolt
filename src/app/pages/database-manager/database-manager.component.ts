import { Component } from '@angular/core'
import { SidebarComponent } from "../../components/sidebar/sidebar.component"
import { TabsComponent } from "../../components/tabs/tabs.component"

@Component({
  selector: 'app-database-manager',
  standalone: true,
  imports: [SidebarComponent, TabsComponent],
  templateUrl: './database-manager.component.html',
  styleUrl: './database-manager.component.scss'
})
export class DatabaseManagerComponent {

}