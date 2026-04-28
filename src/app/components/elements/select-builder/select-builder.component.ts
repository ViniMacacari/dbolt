import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { ConnectionContextService } from '../../../services/connection-context/connection-context.service'

type JoinType = 'JOIN' | 'LEFT JOIN'
type FilterConnector = 'AND' | 'OR'
type FilterOperator =
  | '='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'LIKE'
  | 'NOT LIKE'
  | 'IN'
  | 'NOT IN'
  | 'BETWEEN'
  | 'IS NULL'
  | 'IS NOT NULL'

interface SelectJoin {
  id: number
  type: JoinType
  table: string
  alias: string
  leftField: string
  operator: string
  rightField: string
}

interface SelectFilter {
  id: number
  connector: FilterConnector
  field: string
  operator: FilterOperator
  value: string
  valueTo: string
}

interface BuilderState {
  baseTable: string
  baseAlias: string
  columnsText: string
  distinct: boolean
  quoteIdentifiers: boolean
  joins: SelectJoin[]
  filters: SelectFilter[]
}

@Component({
  selector: 'app-select-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './select-builder.component.html',
  styleUrl: './select-builder.component.scss'
})
export class SelectBuilderComponent implements OnInit, OnChanges {
  @Input() tabInfo: any
  @Output() queryRequested = new EventEmitter<any>()

  baseTable: string = ''
  baseAlias: string = ''
  columnsText: string = '*'
  distinct: boolean = false
  quoteIdentifiers: boolean = false

  joins: SelectJoin[] = []
  filters: SelectFilter[] = []
  objectOptions: string[] = []
  visibleObjectOptions: string[] = []
  isLoadingObjects: boolean = false
  metadataMessage: string = ''
  metadataInfo: string = 'Object suggestions load on demand.'
  copiedMessage: string = ''
  generatedSql: string = '-- Select a base table to generate SQL.'
  readonly objectListId = `select-builder-objects-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  readonly maxObjectSuggestions = 80
  readonly maxIndexedObjects = 5000

  readonly joinTypes: JoinType[] = ['JOIN', 'LEFT JOIN']
  readonly joinOperators: string[] = ['=', '<>', '>', '>=', '<', '<=']
  readonly filterConnectors: FilterConnector[] = ['AND', 'OR']
  readonly filterOperators: FilterOperator[] = [
    '=',
    '<>',
    '>',
    '>=',
    '<',
    '<=',
    'LIKE',
    'NOT LIKE',
    'IN',
    'NOT IN',
    'BETWEEN',
    'IS NULL',
    'IS NOT NULL'
  ]

  private nextJoinId = 1
  private nextFilterId = 1

  constructor(
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  ngOnInit(): void {
    this.restoreState()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabInfo'] && !changes['tabInfo'].firstChange) {
      this.clearObjectOptions()
      this.restoreState()
    }
  }

  addJoin(type: JoinType = 'JOIN'): void {
    this.joins.push({
      id: this.nextJoinId++,
      type,
      table: '',
      alias: '',
      leftField: '',
      operator: '=',
      rightField: ''
    })
    this.onStateChange()
  }

  removeJoin(joinId: number): void {
    this.joins = this.joins.filter((join) => join.id !== joinId)
    this.onStateChange()
  }

  addFilter(): void {
    this.filters.push({
      id: this.nextFilterId++,
      connector: 'AND',
      field: '',
      operator: '=',
      value: '',
      valueTo: ''
    })
    this.onStateChange()
  }

  removeFilter(filterId: number): void {
    this.filters = this.filters.filter((filter) => filter.id !== filterId)
    this.onStateChange()
  }

  resetBuilder(): void {
    this.baseTable = ''
    this.baseAlias = ''
    this.columnsText = '*'
    this.distinct = false
    this.quoteIdentifiers = false
    this.joins = []
    this.filters = []
    this.nextJoinId = 1
    this.nextFilterId = 1
    this.onStateChange()
  }

  onStateChange(): void {
    this.copiedMessage = ''
    this.updateGeneratedSql()
    this.persistState()
  }

  onObjectLookup(value: string): void {
    this.updateVisibleObjectOptions(value)
  }

  openAsQuery(): void {
    if (!this.canBuild()) return

    this.queryRequested.emit({
      sql: this.buildSql(),
      name: this.resolveQueryName(),
      context: this.tabInfo?.dbInfo
    })
  }

  async copySql(): Promise<void> {
    const sql = this.buildSql()
    if (!sql || !navigator?.clipboard) return

    await navigator.clipboard.writeText(sql)
    this.copiedMessage = 'Copied'
  }

  get databaseLabel(): string {
    const dbInfo = this.tabInfo?.dbInfo
    return [dbInfo?.sgbd, dbInfo?.database, dbInfo?.schema]
      .filter(Boolean)
      .join(' / ') || 'No connection selected'
  }

  canBuild(): boolean {
    return this.baseTable.trim().length > 0
  }

  requiresFilterValue(operator: FilterOperator): boolean {
    return operator !== 'IS NULL' && operator !== 'IS NOT NULL'
  }

  requiresSecondFilterValue(operator: FilterOperator): boolean {
    return operator === 'BETWEEN'
  }

  trackJoin(_: number, join: SelectJoin): number {
    return join.id
  }

  trackFilter(_: number, filter: SelectFilter): number {
    return filter.id
  }

  async loadObjectOptions(): Promise<void> {
    const context = this.tabInfo?.dbInfo
    if (!context?.sgbd || !context?.version) return

    this.isLoadingObjects = true
    this.metadataMessage = ''
    this.metadataInfo = ''

    try {
      const ensuredContext = await this.connectionContext.ensureContext(context)
      if (this.tabInfo) {
        this.tabInfo.dbInfo = ensuredContext
      }

      const queryString = this.connectionContext.toQueryString(ensuredContext)
      const response: any = await this.IAPI.get(`/api/${ensuredContext.sgbd}/${ensuredContext.version}/list-table-objects${queryString}`)

      this.objectOptions = this.buildObjectIndex(response)
      this.updateVisibleObjectOptions(this.baseTable)
      this.metadataInfo = this.objectOptions.length >= this.maxIndexedObjects
        ? `Indexed first ${this.maxIndexedObjects} objects. Type a table name manually if it is not listed.`
        : `Indexed ${this.objectOptions.length} objects. Showing up to ${this.maxObjectSuggestions} suggestions.`
    } catch (error: any) {
      this.metadataMessage = error?.error || error?.message || 'Could not load database objects.'
    } finally {
      this.isLoadingObjects = false
    }
  }

  private restoreState(): void {
    const state: BuilderState | undefined = this.tabInfo?.info?.builderState
    if (!state) {
      this.updateGeneratedSql()
      this.persistState()
      return
    }

    this.baseTable = state.baseTable || ''
    this.baseAlias = state.baseAlias || ''
    this.columnsText = state.columnsText || '*'
    this.distinct = Boolean(state.distinct)
    this.quoteIdentifiers = Boolean(state.quoteIdentifiers)
    this.joins = (state.joins || []).map((join) => ({ ...join }))
    this.filters = (state.filters || []).map((filter) => ({ ...filter }))
    this.nextJoinId = this.getNextId(this.joins)
    this.nextFilterId = this.getNextId(this.filters)
    this.updateGeneratedSql()
    this.updateVisibleObjectOptions(this.baseTable)
  }

  private persistState(): void {
    if (!this.tabInfo) return
    if (!this.tabInfo.info) this.tabInfo.info = {}

    this.tabInfo.info.builderState = {
      baseTable: this.baseTable,
      baseAlias: this.baseAlias,
      columnsText: this.columnsText,
      distinct: this.distinct,
      quoteIdentifiers: this.quoteIdentifiers,
      joins: this.joins.map((join) => ({ ...join })),
      filters: this.filters.map((filter) => ({ ...filter }))
    }
  }

  private getNextId(items: Array<{ id: number }>): number {
    if (items.length === 0) return 1

    return Math.max(...items.map((item) => item.id)) + 1
  }

  private clearObjectOptions(): void {
    this.objectOptions = []
    this.visibleObjectOptions = []
    this.metadataMessage = ''
    this.metadataInfo = 'Object suggestions load on demand.'
  }

  private buildObjectIndex(response: any): string[] {
    const objectNames = new Set<string>()
    this.addObjectNames(objectNames, response?.tables)
    this.addObjectNames(objectNames, response?.views)

    const dataRows = response?.data || []
    if (Array.isArray(dataRows)) {
      for (const item of dataRows) {
        if (objectNames.size >= this.maxIndexedObjects) break
        if (item?.type === 'table' || item?.type === 'view') {
          this.addObjectName(objectNames, item)
        }
      }
    }

    return Array.from(objectNames)
      .slice(0, this.maxIndexedObjects)
      .sort((first, second) => first.localeCompare(second))
  }

  private addObjectNames(objectNames: Set<string>, rows: any): void {
    if (!Array.isArray(rows)) return

    for (const item of rows) {
      if (objectNames.size >= this.maxIndexedObjects) return
      this.addObjectName(objectNames, item)
    }
  }

  private addObjectName(objectNames: Set<string>, item: any): void {
    const name = String(item?.name || item?.NAME || '').trim()
    if (name) {
      objectNames.add(name)
    }
  }

  private updateGeneratedSql(): void {
    this.generatedSql = this.buildSql()
  }

  private updateVisibleObjectOptions(search: string = ''): void {
    if (this.objectOptions.length === 0) {
      this.visibleObjectOptions = []
      return
    }

    const normalizedSearch = search.trim().toLowerCase()
    const source = normalizedSearch
      ? this.objectOptions.filter((objectName) => objectName.toLowerCase().includes(normalizedSearch))
      : this.objectOptions

    this.visibleObjectOptions = source.slice(0, this.maxObjectSuggestions)
  }

  private buildSql(): string {
    const table = this.baseTable.trim()
    if (!table) return '-- Select a base table to generate SQL.'

    const columns = this.resolveColumns()
    const lines = [
      `SELECT${this.distinct ? ' DISTINCT' : ''}`,
      columns.map((column) => `  ${this.formatReference(column)}`).join(',\n'),
      `FROM ${this.formatTable(table)}${this.formatAliasClause(this.baseAlias)}`
    ]

    this.getCompleteJoins().forEach((join) => {
      lines.push(`${join.type} ${this.formatTable(join.table)}${this.formatAliasClause(join.alias)} ON ${this.formatReference(join.leftField)} ${join.operator} ${this.formatReference(join.rightField)}`)
    })

    const filters = this.getCompleteFilters()
    if (filters.length > 0) {
      lines.push('WHERE')
      filters.forEach((filter, index) => {
        const prefix = index === 0 ? '  ' : `  ${filter.connector} `
        lines.push(`${prefix}${this.formatFilterExpression(filter)}`)
      })
    }

    return `${lines.join('\n')};`
  }

  private resolveColumns(): string[] {
    const columns = this.columnsText
      .split(/\r?\n|,/)
      .map((column) => column.trim())
      .filter(Boolean)

    return columns.length > 0 ? columns : ['*']
  }

  private getCompleteJoins(): SelectJoin[] {
    return this.joins.filter((join) =>
      join.table.trim() &&
      join.leftField.trim() &&
      join.rightField.trim()
    )
  }

  private getCompleteFilters(): SelectFilter[] {
    return this.filters.filter((filter) => {
      if (!filter.field.trim()) return false
      if (!this.requiresFilterValue(filter.operator)) return true
      if (!filter.value.trim()) return false
      if (this.requiresSecondFilterValue(filter.operator) && !filter.valueTo.trim()) return false

      return true
    })
  }

  private formatTable(value: string): string {
    return this.formatReference(value)
  }

  private formatAliasClause(alias: string): string {
    const trimmed = alias.trim()
    if (!trimmed) return ''

    return ` ${this.formatAlias(trimmed)}`
  }

  private formatAlias(alias: string): string {
    if (!this.quoteIdentifiers || !this.isSimpleIdentifier(alias)) return alias

    return this.quoteIdentifier(alias)
  }

  private formatReference(value: string): string {
    const trimmed = value.trim()
    if (!this.quoteIdentifiers || trimmed === '*' || !this.isSimpleReference(trimmed)) {
      return trimmed
    }

    return trimmed
      .split('.')
      .map((part) => part === '*' ? part : this.quoteIdentifier(part))
      .join('.')
  }

  private isSimpleReference(value: string): boolean {
    return /^[$A-Z_a-z][$\w]*(\.([$A-Z_a-z][$\w]*|\*))*$/.test(value)
  }

  private isSimpleIdentifier(value: string): boolean {
    return /^[$A-Z_a-z][$\w]*$/.test(value)
  }

  private quoteIdentifier(value: string): string {
    if (this.isAlreadyQuoted(value)) return value

    const sgbd = String(this.tabInfo?.dbInfo?.sgbd || '').toLowerCase()
    if (sgbd === 'mysql') {
      return `\`${value.replace(/`/g, '``')}\``
    }

    if (sgbd === 'sqlserver') {
      return `[${value.replace(/]/g, ']]')}]`
    }

    return `"${value.replace(/"/g, '""')}"`
  }

  private isAlreadyQuoted(value: string): boolean {
    return (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('`') && value.endsWith('`')) ||
      (value.startsWith('[') && value.endsWith(']'))
    )
  }

  private formatFilterExpression(filter: SelectFilter): string {
    const field = this.formatReference(filter.field)

    if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
      return `${field} ${filter.operator}`
    }

    if (filter.operator === 'BETWEEN') {
      return `${field} BETWEEN ${this.formatValue(filter.value)} AND ${this.formatValue(filter.valueTo)}`
    }

    if (filter.operator === 'IN' || filter.operator === 'NOT IN') {
      return `${field} ${filter.operator} (${this.formatListValues(filter.value)})`
    }

    return `${field} ${filter.operator} ${this.formatValue(filter.value)}`
  }

  private formatListValues(value: string): string {
    return value
      .split(',')
      .map((item) => this.formatValue(item))
      .join(', ')
  }

  private formatValue(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return "''"
    if (/^null$/i.test(trimmed)) return 'NULL'
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toUpperCase()
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
    if (/^'.*'$/.test(trimmed)) return trimmed
    if (/^[@:$?][\w.-]+$/.test(trimmed)) return trimmed
    if (/^[A-Z_a-z][$\w]*\(.*\)$/.test(trimmed)) return trimmed

    return `'${trimmed.replace(/'/g, "''")}'`
  }

  private resolveQueryName(): string {
    const tableName = this.baseTable.split('.').pop()?.trim() || 'select'
    return `${tableName} select`
  }
}
