import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewEncapsulation } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ToastComponent } from '../../toast/toast.component'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { DatabaseMetadataService } from '../../../services/db-metadata/database-metadata.service'

@Component({
  selector: 'app-procedure-info',
  standalone: true,
  imports: [CommonModule, ToastComponent],
  templateUrl: './procedure-info.component.html',
  styleUrl: './procedure-info.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ProcedureInfoComponent implements OnInit, OnChanges {
  @Input() data: any
  @Input() tabInfo: any
  @Input() elementName: string = ''
  @Output() editRequested = new EventEmitter<any>()

  ddl: string = ''
  isLoadingMetadata: boolean = false
  metadataError: string = ''

  private ddlRequestId = 0

  constructor(
    private databaseMetadata: DatabaseMetadataService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    void this.loadProcedureDDL()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['data'] && !changes['data'].firstChange) ||
      (changes['elementName'] && !changes['elementName'].firstChange) ||
      (changes['tabInfo'] && !changes['tabInfo'].firstChange)
    ) {
      void this.loadProcedureDDL()
    }
  }

  editProcedure(): void {
    if (this.isLoadingMetadata || this.metadataError) return

    this.editRequested.emit({
      name: this.elementName,
      ddl: this.ddl,
      context: this.tabInfo?.dbInfo || this.data
    })
  }

  private async loadProcedureDDL(): Promise<void> {
    const context = this.tabInfo?.dbInfo || this.data
    if (!context?.sgbd || !context?.version || !this.elementName) {
      this.metadataError = this.t('procedureInfo.noProcedureContext')
      return
    }

    const requestId = ++this.ddlRequestId
    this.isLoadingMetadata = true
    this.metadataError = ''
    this.ddl = ''

    try {
      const ddl = await this.databaseMetadata.loadProcedureDDL(context, this.elementName)

      if (requestId !== this.ddlRequestId) return

      this.ddl = ddl
    } catch (error: any) {
      if (requestId !== this.ddlRequestId) return

      console.error(error)
      this.metadataError = error?.error || error?.message || this.t('procedureInfo.loadDdlFailed')
    } finally {
      if (requestId === this.ddlRequestId) {
        this.isLoadingMetadata = false
      }
    }
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
