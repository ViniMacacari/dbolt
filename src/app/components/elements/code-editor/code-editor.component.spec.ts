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

  it('requests the quick object summary while Caps Lock is held without opening table details', async () => {
    const sql = 'SELECT o.id FROM sales.orders o';
    const editor = (component as any).editor;
    const context = { sgbd: 'Postgres', version: 'v9', schema: 'public' };
    editor.setValue(sql);
    component.active = true;
    component.tabInfo = { dbInfo: context };
    let summaryRequest: any;
    const detailRequests: any[] = [];
    component.objectSummaryRequested.subscribe((request) => summaryRequest = request);
    component.objectInfoRequested.subscribe((request) => detailRequests.push(request));

    await (component as any).handleEditorMouseDown({
      target: {
        position: {
          lineNumber: 1,
          column: sql.indexOf('orders') + 1
        }
      },
      event: {
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        browserEvent: new MouseEvent('mousedown', { button: 0 }),
        preventDefault: jasmine.createSpy('preventDefault')
      }
    });

    expect(summaryRequest).toBeUndefined();
    expect(detailRequests).toEqual([]);

    component.onWindowKeyDown(new KeyboardEvent('keydown', { key: 'CapsLock' }));

    await (component as any).handleEditorMouseDown({
      target: {
        position: {
          lineNumber: 1,
          column: sql.indexOf('orders') + 1
        }
      },
      event: {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        browserEvent: new MouseEvent('mousedown', { button: 0 }),
        preventDefault: jasmine.createSpy('preventDefault')
      }
    });
    component.onWindowKeyUp(new KeyboardEvent('keyup', { key: 'CapsLock' }));

    expect(summaryRequest).toEqual({
      name: 'orders',
      schema: 'sales',
      initialView: undefined,
      context,
      info: context
    });
    expect(detailRequests).toEqual([]);
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

  it('renders a unified change diff and closes it on mouse down', () => {
    (component as any).openChangePeek({
      type: 'modified',
      originalStartLine: 2,
      currentStartLine: 2,
      currentEndLine: 2,
      originalLines: ['  old_column'],
      currentLines: ['  new_column']
    });

    const peek = (component as any).changePeekNode as HTMLElement;
    const rows = peek.querySelectorAll('.dbolt-change-peek-line');
    const closeButton = peek.querySelector('.dbolt-change-peek-close') as HTMLButtonElement;

    expect(rows.length).toBe(2);
    expect(rows[0].classList).toContain('dbolt-change-peek-line-removed');
    expect(rows[0].textContent).toContain('−');
    expect(rows[0].textContent).toContain('old_column');
    expect(rows[1].classList).toContain('dbolt-change-peek-line-added');
    expect(rows[1].textContent).toContain('+');
    expect(rows[1].textContent).toContain('new_column');

    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    closeButton.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBeTrue();
    expect((component as any).changePeekClosing).toBeTrue();
  });
});
