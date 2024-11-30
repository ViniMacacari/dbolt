import { Component } from '@angular/core'
import { SidebarComponent } from "../../components/sidebar/sidebar.component"

@Component({
  selector: 'app-database-manager',
  standalone: true,
  imports: [SidebarComponent],
  templateUrl: './database-manager.component.html',
  styleUrl: './database-manager.component.scss'
})
export class DatabaseManagerComponent {

}