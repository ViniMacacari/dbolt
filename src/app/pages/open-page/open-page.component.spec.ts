import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { OpenPageComponent } from './open-page.component';

describe('OpenPageComponent', () => {
  let component: OpenPageComponent;
  let fixture: ComponentFixture<OpenPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenPageComponent],
      providers: [provideHttpClient(), provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
