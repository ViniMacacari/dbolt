import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaveQueryComponent } from './save-query.component';

describe('SaveConnectionComponent', () => {
  let component: SaveQueryComponent;
  let fixture: ComponentFixture<SaveQueryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaveQueryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaveQueryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
