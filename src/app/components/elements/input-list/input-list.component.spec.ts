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
});
