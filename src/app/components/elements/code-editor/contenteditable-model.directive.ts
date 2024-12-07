import { Directive, ElementRef, HostListener, forwardRef } from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

@Directive({
    selector: '[contenteditableModel]',
    standalone: true,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => ContenteditableModelDirective),
            multi: true
        }
    ]
})
export class ContenteditableModelDirective implements ControlValueAccessor {
    private onChange: (value: string) => void = () => { }
    private onTouched: () => void = () => { }

    constructor(private elementRef: ElementRef) { }

    @HostListener('input')
    onInput(): void {
        const value = this.elementRef.nativeElement.innerText
        if (this.onChange) {
            this.onChange(value)
        }
    }

    @HostListener('blur')
    onBlur(): void {
        if (this.onTouched) {
            this.onTouched()
        }
    }

    writeValue(value: string): void {
        this.elementRef.nativeElement.innerText = value || ''
    }

    registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn
    }

    setDisabledState(isDisabled: boolean): void {
        this.elementRef.nativeElement.contentEditable = !isDisabled
    }
}