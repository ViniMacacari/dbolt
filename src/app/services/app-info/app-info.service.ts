import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'

@Injectable({
    providedIn: 'root'
})
export class AppInfoService {
    constructor(
        private IAPI: InternalApiService
    ) { }

    async getAppInfo(): Promise<string> {
        try {
            const appInfo = await this.IAPI.get<{ version: string }>('/api/app-info')
            return appInfo.version
        } catch (error) {
            console.warn('Could not load app version:', error)
            return ''
        }
    }
}