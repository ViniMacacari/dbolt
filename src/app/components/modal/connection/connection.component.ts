import { Component, EventEmitter, Output } from '@angular/core'
import { InternalApiService } from '../../../services/requests/internal-api.service'

@Component({
  selector: 'app-connection',
  standalone: true,
  templateUrl: './connection.component.html',
  styleUrls: ['./connection.component.scss']
})
export class ConnectionComponent {
  @Output() close = new EventEmitter<void>()

  constructor(
    private IAPI: InternalApiService
  ) { }

  onClose() {
    this.close.emit()
  }
}