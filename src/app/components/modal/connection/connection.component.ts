import { Component, EventEmitter, Output } from '@angular/core'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"

@Component({
  selector: 'app-connection',
  standalone: true,
  templateUrl: './connection.component.html',
  styleUrls: ['./connection.component.scss'],
  imports: [InputListComponent]
})
export class ConnectionComponent {
  @Output() close = new EventEmitter<void>()

  dataList: any = []
  versionList: any = []

  constructor(
    private IAPI: InternalApiService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    console.log('/api/databases/avaliable')
    const result: any = await this.IAPI.get('/api/databases/avaliable')

    this.dataList = result.map((item: { id: number, database: string, versions: any[] }) => ({
      id: item.id,
      name: item.database,
      versions: item.versions
    }))
  }

  onDatabaseSelected(item: { [key: string]: string | number } | null): void {
    if (item === null) {
      console.log('None selected')
      this.versionList = []
    } else {
      console.log('Database selected:', item)
      const selectedDatabase = this.dataList.find((db: any) => db.name === item['name'])
      this.versionList = selectedDatabase?.versions.map((version: any) => ({
        name: version.name
      })) || []
      console.log('Filtered versions:', this.versionList)
    }
  }

  onVersionSelected(item: { [key: string]: string | number } | null): void {
    if (item === null) {
      console.log('None selected')
    } else {
      console.log('Version selected:', item)
    }
  }

  onClose() {
    this.close.emit()
  }
}