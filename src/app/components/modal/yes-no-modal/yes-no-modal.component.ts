import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'

@Component({
  selector: 'app-yes-no-modal',
  standalone: true,
  imports: [],
  templateUrl: './yes-no-modal.component.html',
  styleUrl: './yes-no-modal.component.scss'
})
export class YesNoModalComponent {
  @Output() closeAction = new EventEmitter<void>()
  @Output() continueAction = new EventEmitter<void>()
  @Input() title: string = ''
  @Input() message: string = ''

  close() {
    this.closeAction.emit()
  }

  continue() {
    this.continueAction.emit()
  }
}