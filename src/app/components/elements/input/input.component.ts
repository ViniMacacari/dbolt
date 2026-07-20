import { booleanAttribute, Component, EventEmitter, forwardRef, Input, Output } from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

@Component({
  selector: 'app-input',
  standalone: true,
  templateUrl: './input.component.html',
  styleUrl: './input.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ]
})
export class InputComponent implements ControlValueAccessor {
  @Input() id = ''
  @Input() name = ''
  @Input() type = 'text'
  @Input() placeholder = ''
  @Input() min: number | string | null = null
  @Input() max: number | string | null = null
  @Input() step: number | string | null = null
  @Input() maxlength: number | null = null
  @Input() autocomplete = 'off'
  @Input() ariaLabel = ''
  @Input() ariaDescribedBy = ''
  @Input({ transform: booleanAttribute }) disabled = false
  @Input({ transform: booleanAttribute }) readonly = false
  @Output() blurred = new EventEmitter<FocusEvent>()

  value: string | number | null = ''
  formDisabled = false

  private onChange: (value: string | number | null) => void = () => undefined
  private onTouched: () => void = () => undefined

  get isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  writeValue(value: string | number | null | undefined): void {
    this.value = value ?? ''
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled = disabled
  }

  handleInput(event: Event): void {
    const input = event.target as HTMLInputElement
    const value = this.type === 'number'
      ? (input.value === '' ? null : input.valueAsNumber)
      : input.value

    this.value = value
    this.onChange(value)
  }

  handleBlur(event: FocusEvent): void {
    this.onTouched()
    this.blurred.emit(event)
  }
}
