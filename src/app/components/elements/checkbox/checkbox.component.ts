import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'

let checkboxId = 0

@Component({
  selector: 'app-checkbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkbox.component.html',
  styleUrl: './checkbox.component.scss'
})
export class CheckboxComponent {
  @Input() checked: boolean = false
  @Input() disabled: boolean = false
  @Input() label: string = ''
  @Input() title: string = ''
  @Output() checkedChange = new EventEmitter<boolean>()

  readonly inputId = `dbolt-checkbox-${checkboxId++}`

  onInputChange(event: Event): void {
    if (this.disabled) {
      return
    }

    const input = event.target as HTMLInputElement
    this.checked = input.checked
    this.checkedChange.emit(this.checked)
  }
}
