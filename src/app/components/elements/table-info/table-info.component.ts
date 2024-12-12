import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import * as monaco from 'monaco-editor'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { LoadingComponent } from '../../modal/loading/loading.component'
import { ToastComponent } from '../../toast/toast.component'
import { SaveQueryComponent } from "../../modal/save-query/save-query.component"
import { InternalApiService } from '../../../services/requests/internal-api.service'

@Component({
  selector: 'app-table-info',
  standalone: true,
  imports: [CommonModule, ToastComponent],
  templateUrl: './table-info.component.html',
  styleUrl: './table-info.component.scss'
})
export class TableInfoComponent {
  @Input() data: any
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
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

  showTables: boolean = false
  showViews: boolean = false
  showProcedures: boolean = false
  showIndexes: boolean = false

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private IAPI: InternalApiService
  ) { }

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
}