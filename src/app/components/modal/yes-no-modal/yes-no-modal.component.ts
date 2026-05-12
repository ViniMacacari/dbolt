import { Component, EventEmitter, Output, Input } from '@angular/core'
import { AppLanguageService } from '../../../services/language/app-language.service'

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
  @Input() cancelLabel: string = ''
  @Input() continueLabel: string = ''

  constructor(private language: AppLanguageService) { }

  get resolvedCancelLabel(): string {
    return this.cancelLabel || this.language.translate('generic.cancel')
  }

  get resolvedContinueLabel(): string {
    return this.continueLabel || this.language.translate('generic.continue')
  }

  close() {
    this.closeAction.emit()
  }

  continue() {
    this.continueAction.emit()
  }
}
