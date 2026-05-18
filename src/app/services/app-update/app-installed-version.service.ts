import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'

@Injectable({
  providedIn: 'root'
})
export class AppInstalledVersionService {
  constructor(private internalApi: InternalApiService) { }

  async getInstalledVersion(): Promise<string> {
    const appInfo = await this.internalApi.get<{ version: string }>('/api/app-info')
    return appInfo.version
  }
}

