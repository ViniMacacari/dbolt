import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { FixTableDataComponent } from './fix-table-data.component';

describe('FixTableDataComponent', () => {
  let component: FixTableDataComponent;
  let fixture: ComponentFixture<FixTableDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FixTableDataComponent],
      providers: [provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FixTableDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
