import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TableQueryComponent } from './table-query.component';

describe('TableQueryComponent', () => {
  let component: TableQueryComponent;
  let fixture: ComponentFixture<TableQueryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableQueryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TableQueryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
