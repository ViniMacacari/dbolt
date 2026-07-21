import { booleanAttribute, Component, EventEmitter, Input, Output } from '@angular/core'

export type AppButtonVariant = 'primary' | 'danger'

@Component({
  selector: 'app-button',
  standalone: true,
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss'
})
export class ButtonComponent {
  @Input() type: 'button' | 'submit' = 'button'
  @Input() variant: AppButtonVariant = 'primary'
  @Input() title = ''
  @Input() ariaLabel = ''
  @Input({ transform: booleanAttribute }) disabled = false
  @Output() pressed = new EventEmitter<MouseEvent>()

  onClick(event: MouseEvent): void {
    if (!this.disabled) {
      this.pressed.emit(event)
    }
  }
}
