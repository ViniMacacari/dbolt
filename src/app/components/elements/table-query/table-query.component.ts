import { Component, Output, EventEmitter, Input } from '@angular/core'

@Component({
  selector: 'app-table-query',
  standalone: true,
  imports: [],
  templateUrl: './table-query.component.html',
  styleUrl: './table-query.component.scss'
})
export class TableQueryComponent {
  @Input() query: any

  
}