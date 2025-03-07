import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatabaseManagerComponent } from './database-manager.component';

describe('DatabaseManagerComponent', () => {
  let component: DatabaseManagerComponent;
  let fixture: ComponentFixture<DatabaseManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatabaseManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
