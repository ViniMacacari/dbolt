import { Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() connections: any[] = []
  @Input() activeConnection: any = { info: {}, data: [] }
  @Input() dbSchemas: any = []

  isOpen = true
  expandedConnections: Set<string> = new Set()
  expandedDatabases: Set<string> = new Set()

  constructor() { }

  ngOnChanges(changes: any) {
    if (changes['dbSchemas']) {
      console.log('mudou>: ', this.dbSchemas)
    }
  }

  toggle() {
    this.isOpen = !this.isOpen
  }

  toggleConnection(connection: string) {
    if (this.expandedConnections.has(connection)) {
      this.expandedConnections.delete(connection)
    } else {
      this.expandedConnections.add(connection)
    }
  }

  toggleDatabase(database: string) {
    if (this.expandedDatabases.has(database)) {
      this.expandedDatabases.delete(database)
    } else {
      this.expandedDatabases.add(database)
    }
  }
}