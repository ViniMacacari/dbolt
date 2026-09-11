import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { TableInfoComponent } from './table-info.component';

describe('TableInfoComponent', () => {
  let component: TableInfoComponent;
  let fixture: ComponentFixture<TableInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableInfoComponent],
      providers: [provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TableInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
