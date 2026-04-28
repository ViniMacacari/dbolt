import { Component, EventEmitter, Input, Output } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-query-assistant',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-assistant.component.html',
  styleUrl: './query-assistant.component.scss'
})
export class QueryAssistantComponent {
  @Input() tabInfo: any
  @Output() selectBuilderRequested = new EventEmitter<any>()

  openSelectBuilder(): void {
    this.selectBuilderRequested.emit({
      context: this.tabInfo?.dbInfo
    })
  }

  get connectionLabel(): string {
    const dbInfo = this.tabInfo?.dbInfo
    return [dbInfo?.sgbd, dbInfo?.database, dbInfo?.schema]
      .filter(Boolean)
      .join(' / ') || 'No connection selected'
  }
}
