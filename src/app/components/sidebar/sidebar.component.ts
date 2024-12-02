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

  constructor() { }

  //identificar quando dbSchema mudar
  ngOnChanges(changes: any) {
    if (changes['dbSchemas']) {
      console.log('mudou>: ', this.dbSchemas)
    }
  }

  toggle() {
    this.isOpen = !this.isOpen
  }
}