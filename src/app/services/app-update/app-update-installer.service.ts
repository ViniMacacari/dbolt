import { Injectable } from '@angular/core'

import { AppDownloadRelease } from './app-update.model'

@Injectable({
  providedIn: 'root'
})
export class AppUpdateInstallerService {
  async downloadAndOpenInstaller(release: AppDownloadRelease): Promise<void> {
    if (!window.dboltAppUpdate) {
      throw new Error('Native update API is unavailable.')
    }

    await window.dboltAppUpdate.downloadAndOpenInstaller({
      url: release.url,
      fileName: release.fileName
    })
  }
}

