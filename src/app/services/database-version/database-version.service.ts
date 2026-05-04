import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'

interface DatabaseVersionResponse {
  success: boolean
  version?: string
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseVersionService {
  readonly unknownVersion = 'Unknown database version'

  constructor(private IAPI: InternalApiService) { }

  async detectDatabaseVersion(database: string, driverVersion: string, config: any): Promise<string> {
    if (!database || !driverVersion) {
      return this.unknownVersion
    }

    try {
      const response = await this.IAPI.post<DatabaseVersionResponse>(
        `/api/${database}/${driverVersion}/database-version`,
        config
      )
      const version = String(response?.version || '').trim()

      return version || this.unknownVersion
    } catch (error) {
      console.warn('Could not detect database version:', error)
      return this.unknownVersion
    }
  }
}
