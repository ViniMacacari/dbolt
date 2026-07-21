import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('shows the connection content only after its schemas are ready', async () => {
    const connection = { id: 12 };
    spyOn(component, 'canConnect').and.resolveTo();

    const opening = component.toggleConnection(connection);

    expect(component.expandedConnections.has(12)).toBeTrue();
    expect(component.expandedConnectionContents.has(12)).toBeFalse();

    await opening;

    expect(component.expandedConnectionContents.has(12)).toBeTrue();
  });

  it('keeps the connection content mounted while switching it to the collapsed state', async () => {
    const connection = { id: 12 };
    spyOn(component, 'canConnect').and.resolveTo();
    await component.toggleConnection(connection);

    await component.toggleConnection(connection);

    expect(component.expandedConnections.has(12)).toBeFalse();
    expect(component.expandedConnectionContents.has(12)).toBeFalse();
  });
});
