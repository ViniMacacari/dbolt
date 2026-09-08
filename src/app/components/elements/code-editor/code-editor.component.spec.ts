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

  it('marks added and modified lines relative to the last saved SQL', () => {
    component.tabInfo = {
      originalContent: 'SELECT\n  column_a\nFROM table_a'
    };
    const editor = (component as any).editor;
    editor.setValue('SELECT\n  column_b\nFROM table_a\nWHERE enabled = 1');

    (component as any).updateSqlChangeDecorations();

    const decorationClasses = editor.getModel().getAllDecorations()
      .map((decoration: any) => decoration.options.linesDecorationsClassName)
      .filter(Boolean);
    expect(decorationClasses).toContain('dbolt-sql-change-modified');
    expect(decorationClasses).toContain('dbolt-sql-change-added');
  });

  it('marks deleted lines and clears all markers after saving', () => {
    component.tabInfo = {
      originalContent: 'SELECT\n  column_a,\n  column_b\nFROM table_a'
    };
    const editor = (component as any).editor;
    const currentSql = 'SELECT\n  column_a\nFROM table_a';
    editor.setValue(currentSql);

    (component as any).updateSqlChangeDecorations();

    const changedDecorations = editor.getModel().getAllDecorations()
      .filter((decoration: any) => decoration.options.linesDecorationsClassName?.startsWith('dbolt-sql-change-'));
    expect(changedDecorations.some((decoration: any) =>
      decoration.options.linesDecorationsClassName === 'dbolt-sql-change-deleted'
    )).toBeTrue();

    component.tabInfo.originalContent = currentSql;
    (component as any).updateSqlChangeDecorations();

    const savedDecorations = editor.getModel().getAllDecorations()
      .filter((decoration: any) => decoration.options.linesDecorationsClassName?.startsWith('dbolt-sql-change-'));
    expect(savedDecorations).toEqual([]);
  });
});
