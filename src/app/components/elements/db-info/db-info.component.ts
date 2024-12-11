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
  selector: 'app-db-info',
  standalone: true,
  imports: [CommonModule, ToastComponent],
  templateUrl: './db-info.component.html',
  styleUrl: './db-info.component.scss'
})
export class DbInfoComponent {
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

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private IAPI: InternalApiService
  ) { }

  async filterTables(): Promise<void> {
    console.log('data: ', this.data)
    this.showTables = true
  }
}
