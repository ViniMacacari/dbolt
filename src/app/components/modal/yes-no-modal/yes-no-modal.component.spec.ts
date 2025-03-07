import { ComponentFixture, TestBed } from '@angular/core/testing';

import { YesNoModalComponent } from './yes-no-modal.component';

describe('YesNoModalComponent', () => {
  let component: YesNoModalComponent;
  let fixture: ComponentFixture<YesNoModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [YesNoModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(YesNoModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
