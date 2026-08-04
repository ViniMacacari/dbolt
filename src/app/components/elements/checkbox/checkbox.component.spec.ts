import { TestBed } from '@angular/core/testing'

import { CheckboxComponent } from './checkbox.component'

describe('CheckboxComponent', () => {
  it('keeps the existing switch as the default variant', () => {
    const fixture = TestBed.createComponent(CheckboxComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.checkbox-control-box')).toBeNull()
  })

  it('renders the compact box variant through the shared component', () => {
    const fixture = TestBed.createComponent(CheckboxComponent)
    fixture.componentInstance.variant = 'box'
    fixture.componentInstance.ariaLabel = 'Select object'
    fixture.detectChanges()

    const control = fixture.nativeElement.querySelector('.checkbox-control-box') as HTMLElement
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement
    expect(control).not.toBeNull()
    expect(input.getAttribute('aria-label')).toBe('Select object')
  })
})
