import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core'
import { CommonModule } from '@angular/common'
import * as monaco from 'monaco-editor'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { LoadingComponent } from '../../modal/loading/loading.component'
import { ToastComponent } from '../../toast/toast.component'
import { SaveQueryComponent } from "../../modal/save-query/save-query.component"
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { FixTableDataComponent } from '../fix-table-data/fix-table-data.component'

@Component({
  selector: 'app-table-info',
  standalone: true,
  imports: [CommonModule, ToastComponent, FixTableDataComponent],
  templateUrl: './table-info.component.html',
  styleUrl: './table-info.component.scss'
})
export class TableInfoComponent {
  @Input() data: any
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any
  @Input() elementName: string = ''

  @ViewChild('editorContainer') editorContainer!: ElementRef
  @ViewChild(ToastComponent) toast!: ToastComponent
  @ViewChild(SaveQueryComponent) saveConnection!: SaveQueryComponent

  isSaveAsOpen: boolean = false
  cacheSql: string = ''
  queryReponse: any[] = []
  queryLines: number = 50

  dataSave: any = {}

  showData: boolean = false
  showColumns: boolean = false
  showKeys: boolean = false
  showIndexes: boolean = false
  showDDL: boolean = false

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private IAPI: InternalApiService
  ) { }

  async filterData(): Promise<void> {
    this.showData = true
    this.showColumns = false
    this.showKeys = false
    this.showIndexes = false
    this.showDDL = false
  }

  async filterColumns(): Promise<void> {
    this.showData = false
    this.showColumns = true
    this.showKeys = false
    this.showIndexes = false
    this.showDDL = false
  }

  async filterKeys(): Promise<void> {
    this.showData = false
    this.showColumns = false
    this.showKeys = true
    this.showIndexes = false
    this.showDDL = false
  }

  async filterIndexes(): Promise<void> {
    this.showData = false
    this.showColumns = false
    this.showKeys = false
    this.showIndexes = true
    this.showDDL = false
  }

  async filterDDL(): Promise<void> {
    this.showData = false
    this.showColumns = false
    this.showKeys = false
    this.showIndexes = false
    this.showDDL = true
  }
}