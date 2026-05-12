import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewEncapsulation } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ToastComponent } from '../../toast/toast.component'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

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

  constructor(
    private IAPI: InternalApiService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    void this.loadProcedureDDL()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
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

    this.isLoadingMetadata = true
    this.metadataError = ''
    this.ddl = ''

    try {
      const procedureName = encodeURIComponent(this.elementName)
      const queryString = context.connectionKey
        ? `?connectionKey=${encodeURIComponent(context.connectionKey)}`
        : ''
      const response: any = await this.IAPI.get(`/api/${context.sgbd}/${context.version}/procedure-ddl/${procedureName}${queryString}`)

      if (response?.success === false) {
        throw new Error(response.error || response.message || this.t('procedureInfo.loadDdlFailed'))
      }

      this.ddl = response?.ddl || ''
    } catch (error: any) {
      console.error(error)
      this.metadataError = error?.error || error?.message || this.t('procedureInfo.loadDdlFailed')
    } finally {
      this.isLoadingMetadata = false
    }
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
