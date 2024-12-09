import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaveConnectionComponent } from './save-connection.component';

describe('SaveConnectionComponent', () => {
  let component: SaveConnectionComponent;
  let fixture: ComponentFixture<SaveConnectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaveConnectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaveConnectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
