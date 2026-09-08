import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { EditConnectionComponent } from './edit-connection.component';

describe('EditConnectionComponent', () => {
  let component: EditConnectionComponent;
  let fixture: ComponentFixture<EditConnectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditConnectionComponent],
      providers: [provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditConnectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
