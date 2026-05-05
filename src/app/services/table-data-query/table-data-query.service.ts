import { Injectable } from '@angular/core'

type AgGridFilterModel = Record<string, any>

@Injectable({
  providedIn: 'root'
})
export class TableDataQueryService {
  buildSelectSql(tableName: string, filterModel: AgGridFilterModel = {}, dbContext: any = null): string {
    const tableReference = this.quoteTableReference(tableName, dbContext)
    const whereClause = this.buildWhereClause(filterModel, dbContext)
    return ['select * from', tableReference, whereClause].filter(Boolean).join(' ')
  }

  private buildWhereClause(filterModel: AgGridFilterModel, dbContext: any): string {
    const expressions = Object.entries(filterModel || {})
      .filter(([field]) => field !== '__dbolt_row_index__')
      .map(([field, model]) => this.buildFilterExpression(this.quoteIdentifier(field, dbContext), model, dbContext))
      .filter(Boolean)

    return expressions.length > 0 ? `where ${expressions.join(' and ')}` : ''
  }

  private buildFilterExpression(column: string, model: any, dbContext: any): string {
    if (!model) return ''

    if (Array.isArray(model.filterModels)) {
      return this.joinExpressions(
        model.filterModels.map((filterModel: any) => this.buildFilterExpression(column, filterModel, dbContext)),
        'and'
      )
    }

    const conditions = this.getConditions(model)
    if (conditions.length > 0) {
      return this.joinExpressions(
        conditions.map((condition) => this.buildSimpleFilterExpression(column, condition, dbContext)),
        model.operator || 'and'
      )
    }

    return this.buildSimpleFilterExpression(column, model, dbContext)
  }

  private buildSimpleFilterExpression(column: string, model: any, dbContext: any): string {
    if (!model) return ''

    if (model.filterType === 'set') {
      return this.buildSetExpression(column, model)
    }

    if (model.filterType === 'number') {
      return this.buildNumberExpression(column, model)
    }

    if (model.filterType === 'date') {
      return this.buildDateExpression(column, model)
    }

    return this.buildTextExpression(column, model, dbContext)
  }

  private buildTextExpression(column: string, model: any, dbContext: any): string {
    const type = String(model.type || 'contains')
    const textColumn = this.textComparableExpression(column, dbContext)
    const value = String(model.filter ?? '')
    const normalizedValue = value.toLowerCase()

    if (type === 'blank') return `(${column} is null or ${textColumn} = '')`
    if (type === 'notBlank') return `(${column} is not null and ${textColumn} <> '')`
    if (!value) return ''

    if (type === 'equals') return `${textColumn} = ${this.quoteString(normalizedValue)}`
    if (type === 'notEqual') return `${textColumn} <> ${this.quoteString(normalizedValue)}`
    if (type === 'startsWith') return `${textColumn} like ${this.quoteLike(`${normalizedValue}%`)} escape '\\'`
    if (type === 'endsWith') return `${textColumn} like ${this.quoteLike(`%${normalizedValue}`)} escape '\\'`
    if (type === 'notContains') return `${textColumn} not like ${this.quoteLike(`%${normalizedValue}%`)} escape '\\'`

    return `${textColumn} like ${this.quoteLike(`%${normalizedValue}%`)} escape '\\'`
  }

  private buildNumberExpression(column: string, model: any): string {
    const type = String(model.type || 'equals')
    const value = this.numberLiteral(model.filter)
    const valueTo = this.numberLiteral(model.filterTo)

    if (type === 'blank') return `${column} is null`
    if (type === 'notBlank') return `${column} is not null`
    if (value === '') return ''

    if (type === 'notEqual') return `${column} <> ${value}`
    if (type === 'lessThan') return `${column} < ${value}`
    if (type === 'lessThanOrEqual') return `${column} <= ${value}`
    if (type === 'greaterThan') return `${column} > ${value}`
    if (type === 'greaterThanOrEqual') return `${column} >= ${value}`
    if (type === 'inRange' && valueTo !== '') return `(${column} >= ${value} and ${column} <= ${valueTo})`

    return `${column} = ${value}`
  }

  private buildDateExpression(column: string, model: any): string {
    const type = String(model.type || 'equals')
    const value = this.dateLiteral(model.dateFrom || model.filter)
    const valueTo = this.dateLiteral(model.dateTo || model.filterTo)

    if (type === 'blank') return `${column} is null`
    if (type === 'notBlank') return `${column} is not null`
    if (!value) return ''

    if (type === 'notEqual') return `${column} <> ${value}`
    if (type === 'lessThan') return `${column} < ${value}`
    if (type === 'lessThanOrEqual') return `${column} <= ${value}`
    if (type === 'greaterThan') return `${column} > ${value}`
    if (type === 'greaterThanOrEqual') return `${column} >= ${value}`
    if (type === 'inRange' && valueTo) return `(${column} >= ${value} and ${column} <= ${valueTo})`

    return `${column} = ${value}`
  }

  private buildSetExpression(column: string, model: any): string {
    const values = (model.values || []).map((value: any) => this.quoteValue(value))
    if (values.length === 0) return ''

    return `${column} in (${values.join(', ')})`
  }

  private getConditions(model: any): any[] {
    if (Array.isArray(model.conditions)) {
      return model.conditions.filter(Boolean)
    }

    return [model.condition1, model.condition2].filter(Boolean)
  }

  private joinExpressions(expressions: string[], operator: string): string {
    const validExpressions = expressions.filter(Boolean)
    if (validExpressions.length === 0) return ''
    if (validExpressions.length === 1) return validExpressions[0]

    return `(${validExpressions.join(` ${String(operator || 'and').toLowerCase()} `)})`
  }

  private textComparableExpression(column: string, dbContext: any): string {
    const sgbd = String(dbContext?.sgbd || '').toLowerCase()

    if (sgbd === 'mysql') return `lower(cast(${column} as char))`
    if (sgbd === 'sqlite') return `lower(cast(${column} as text))`
    if (sgbd === 'sqlserver') return `lower(cast(${column} as nvarchar(max)))`
    if (sgbd === 'hana') return `lower(cast(${column} as nvarchar(5000)))`

    return `lower(cast(${column} as varchar(5000)))`
  }

  private quoteIdentifier(identifier: string, dbContext: any): string {
    const value = String(identifier || '')
    const sgbd = String(dbContext?.sgbd || '').toLowerCase()

    if (sgbd === 'mysql') return `\`${value.replace(/`/g, '``')}\``
    if (sgbd === 'sqlserver') return `[${value.replace(/]/g, ']]')}]`

    return `"${value.replace(/"/g, '""')}"`
  }

  private quoteTableReference(tableName: string, dbContext: any): string {
    return String(tableName || '')
      .split('.')
      .map((part) => this.quoteIdentifier(this.unquoteIdentifier(part.trim()), dbContext))
      .join('.')
  }

  private unquoteIdentifier(identifier: string): string {
    return String(identifier || '')
      .replace(/^\[|\]$/g, '')
      .replace(/^"|"$/g, '')
      .replace(/^`|`$/g, '')
  }

  private quoteValue(value: any): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'boolean') return value ? 'true' : 'false'

    return this.quoteString(String(value))
  }

  private quoteString(value: string): string {
    return `'${String(value).replace(/'/g, "''")}'`
  }

  private quoteLike(value: string): string {
    return this.quoteString(String(value).replace(/[\\%_]/g, (match) => `\\${match}`))
  }

  private numberLiteral(value: any): string {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? String(numberValue) : ''
  }

  private dateLiteral(value: any): string {
    const dateValue = String(value || '').trim()
    return dateValue ? this.quoteString(dateValue.slice(0, 10)) : ''
  }
}
