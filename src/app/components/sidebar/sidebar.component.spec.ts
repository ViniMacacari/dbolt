import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideHttpClient(), provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the quick selector mounted during its closing animation', fakeAsync(() => {
    component.toggleQuickSelector('connection', new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.quick-selector-backdrop')).not.toBeNull();

    component.closeQuickSelector();
    fixture.detectChanges();

    const closingBackdrop = fixture.nativeElement.querySelector('.quick-selector-backdrop');
    expect(component.quickSelectorType).toBe('connection');
    expect(component.quickSelectorClosing).toBeTrue();
    expect(closingBackdrop.classList).toContain('quick-selector-closing');

    tick(180);
    fixture.detectChanges();

    expect(component.quickSelectorType).toBeNull();
    expect(component.quickSelectorClosing).toBeFalse();
    expect(fixture.nativeElement.querySelector('.quick-selector-backdrop')).toBeNull();
  }));
});
