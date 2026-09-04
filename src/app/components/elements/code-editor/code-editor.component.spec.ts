import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CodeEditorComponent } from './code-editor.component';

describe('CodeEditorComponent', () => {
  let component: CodeEditorComponent;
  let fixture: ComponentFixture<CodeEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodeEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CodeEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('preserves an explicit schema when resolving a table alias for Ctrl+Click', () => {
    const sql = 'SELECT o.id FROM sales.orders o';
    const editor = (component as any).editor;
    editor.setValue(sql);

    const tableLink = (component as any).resolveSqlNavigationLink({
      lineNumber: 1,
      column: sql.indexOf('orders') + 1
    });
    const aliasLink = (component as any).resolveSqlNavigationLink({
      lineNumber: 1,
      column: sql.indexOf('o.id') + 1
    });

    expect(tableLink?.target).toEqual({
      name: 'orders',
      schema: 'sales',
      initialView: undefined
    });
    expect(aliasLink?.target).toEqual({
      name: 'orders',
      schema: 'sales',
      initialView: undefined
    });
  });

  it('preserves the referenced schema when navigating from an aliased column', () => {
    const sql = 'SELECT o.id FROM sales.orders o';
    const editor = (component as any).editor;
    editor.setValue(sql);

    const link = (component as any).resolveSqlNavigationLink({
      lineNumber: 1,
      column: sql.indexOf('id') + 1
    });

    expect(link?.target).toEqual({
      name: 'orders',
      schema: 'sales',
      initialView: 'columns'
    });
  });
});
