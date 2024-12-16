import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import * as monaco from 'monaco-editor'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { LoadingComponent } from '../../modal/loading/loading.component'
import { ToastComponent } from '../../toast/toast.component'
import { SaveQueryComponent } from "../../modal/save-query/save-query.component"
import { InternalApiService } from '../../../services/requests/internal-api.service'

@Component({
  selector: 'app-db-info',
  standalone: true,
  imports: [CommonModule, ToastComponent, FormsModule],
  templateUrl: './db-info.component.html',
  styleUrl: './db-info.component.scss'
})
export class DbInfoComponent {
  @Input() data: any
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
  @Output() moreInfo = new EventEmitter<any>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any

  @ViewChild('editorContainer') editorContainer!: ElementRef
  @ViewChild(ToastComponent) toast!: ToastComponent
  @ViewChild(SaveQueryComponent) saveConnection!: SaveQueryComponent

  isSaveAsOpen: boolean = false
  cacheSql: string = ''
  queryReponse: any[] = []
  queryLines: number = 50

  dataSave: any = {}

  showTables: boolean = true
  showViews: boolean = false
  showProcedures: boolean = false
  showIndexes: boolean = false

  filterTable: string = ''
  filteredTables: any[] = []

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private IAPI: InternalApiService
  ) { }

  ngOnInit(): void {
    this.filteredTables = this.data.tables
  }

  async filterTables(): Promise<void> {
    this.showTables = true
    this.showViews = false
    this.showProcedures = false
    this.showIndexes = false
  }

  async filterViews(): Promise<void> {
    this.showTables = false
    this.showViews = true
    this.showProcedures = false
    this.showIndexes = false
  }

  async filterProcedures(): Promise<void> {
    this.showTables = false
    this.showViews = false
    this.showProcedures = true
    this.showIndexes = false
  }

  async filterIndexes(): Promise<void> {
    this.showTables = false
    this.showViews = false
    this.showProcedures = false
    this.showIndexes = true
  }

  tableInfo(tabInfo: any): void {
    tabInfo = {
      ...tabInfo,
      info: this.data.connection
    }

    console.log('->', tabInfo)

    this.moreInfo.emit(tabInfo)
  }

  applyFilterTable(): void {
    const searchText = this.filterTable.toLowerCase()
    if (!searchText) {
      this.filteredTables = this.data.tables
    } else {
      this.filteredTables = this.data.tables.filter((table: any) =>
        (table.NAME || table.name)
          .toString()
          .toLowerCase()
          .includes(searchText)
      )
    }
  }
}