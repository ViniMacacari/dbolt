import { SqlObjectSummaryComponent } from './sql-object-summary.component'

describe('SqlObjectSummaryComponent', () => {
  it('shows view columns first and loads DDL only when requested', async () => {
    const metadata = {
      loadTableColumnSummary: jasmine.createSpy().and.resolveTo({
        objectType: 'view',
        columns: [
          { name: 'order_id', type: 'integer', is_nullable: 'NO', object_type: 'view' }
        ]
      }),
      loadTableDDL: jasmine.createSpy().and.resolveTo('CREATE VIEW order_summary AS SELECT 1;')
    }
    const language = {
      translate: (key: string, params: Record<string, string | number> = {}) =>
        Object.entries(params).reduce(
          (text, [name, value]) => text.replace(`{${name}}`, String(value)),
          key
        )
    }
    const component = new SqlObjectSummaryComponent(metadata as any, language as any)
    component.request = {
      name: 'order_summary',
      schema: 'sales',
      context: { sgbd: 'Postgres', version: 'v9', database: 'app', schema: 'sales' }
    }

    await component.loadSummary()

    expect(component.isView).toBeTrue()
    expect(component.activeView).toBe('columns')
    expect(component.rows.length).toBe(1)
    expect(metadata.loadTableDDL).not.toHaveBeenCalled()

    await component.showDdl()

    expect(component.activeView).toBe('ddl')
    expect(component.ddl).toBe('CREATE VIEW order_summary AS SELECT 1;')
    expect(metadata.loadTableDDL).toHaveBeenCalledOnceWith(component.request.context, 'order_summary')
  })

  it('filters the AG Grid through its quick filter', () => {
    const component = new SqlObjectSummaryComponent({} as any, {
      translate: (key: string) => key
    } as any)
    const gridApi = {
      setGridOption: jasmine.createSpy(),
      getDisplayedRowCount: jasmine.createSpy().and.returnValue(1)
    }
    ;(component as any).gridApi = gridApi

    component.onFilterInput({ target: { value: 'order' } } as unknown as Event)

    expect(component.filterText).toBe('order')
    expect(gridApi.setGridOption).toHaveBeenCalledWith('quickFilterText', 'order')
    expect(component.filteredRowCount).toBe(1)
  })

  it('keeps the main metadata columns readable instead of fitting every column into the panel', () => {
    const component = new SqlObjectSummaryComponent({} as any, {
      translate: (key: string) => key
    } as any)

    const columns = (component as any).buildColumnDefs([{
      ordinal_position: 1,
      name: 'order_id',
      type: 'INTEGER',
      is_nullable: false,
      comment: 'Order identifier'
    }])

    expect(columns.find((column: any) => column.field === 'name').width).toBe(190)
    expect(columns.find((column: any) => column.field === 'type').width).toBe(180)
    expect(columns.every((column: any) => column.flex === undefined)).toBeTrue()
  })
})
