import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputListComponent } from './input-list.component';

describe('InputListComponent', () => {
  let component: InputListComponent;
  let fixture: ComponentFixture<InputListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows every option when opening a list with a selected value', () => {
    fixture.componentRef.setInput('list', [
      { value: 'dark', label: 'Escuro' },
      { value: 'light', label: 'Claro' }
    ]);
    fixture.componentRef.setInput('displayKey', 'label');
    fixture.componentRef.setInput('valueKey', 'value');
    fixture.componentRef.setInput('selectedValue', 'dark');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('Escuro');

    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const options = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.dropdown-item'))
      .map(option => option.textContent?.trim());
    expect(options).toEqual(['Escuro', 'Claro']);
  });

  it('does not open the dropdown while disabled', () => {
    fixture.componentRef.setInput('list', [{ id: 1, name: 'Connection' }]);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(input.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.dropdown-list')).toBeNull();
  });

  it('clears the displayed item when the selected value is cleared', () => {
    fixture.componentRef.setInput('list', [{ value: 'dark', label: 'Escuro' }]);
    fixture.componentRef.setInput('displayKey', 'label');
    fixture.componentRef.setInput('valueKey', 'value');
    fixture.componentRef.setInput('selectedValue', 'dark');
    fixture.detectChanges();

    fixture.componentRef.setInput('selectedValue', null);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('');
  });

  it('keeps hovered options stable and selectable when the list input is recreated', () => {
    const options = [
      { id: 1, name: 'First option' },
      { id: 2, name: 'Second option' }
    ];
    fixture.componentRef.setInput('list', options);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const optionBefore: HTMLElement = fixture.nativeElement.querySelectorAll('.dropdown-item')[1];

    fixture.componentRef.setInput('list', options.map(option => ({ ...option })));
    fixture.detectChanges();

    const optionAfter: HTMLElement = fixture.nativeElement.querySelectorAll('.dropdown-item')[1];
    expect(optionAfter).toBe(optionBefore);

    const emitted = spyOn(component.itemSelected, 'emit');
    optionAfter.click();
    fixture.detectChanges();

    expect(emitted).toHaveBeenCalledWith(jasmine.objectContaining({ id: 2 }));
    expect(input.value).toBe('Second option');
    expect(fixture.nativeElement.querySelector('.dropdown-list')).toBeNull();
  });
});
