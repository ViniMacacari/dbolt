import { Injectable } from '@angular/core'

import { AppDownloadRelease, AppUpdateDownloadProgress } from './app-update.model'

@Injectable({
  providedIn: 'root'
})
export class AppUpdateInstallerService {
  async downloadAndOpenInstaller(
    release: AppDownloadRelease,
    onProgress: (progress: AppUpdateDownloadProgress) => void
  ): Promise<void> {
    if (!window.dboltAppUpdate) {
      throw new Error('Native update API is unavailable.')
    }

    const requestId = this.createRequestId()
    const removeProgressListener = window.dboltAppUpdate.onDownloadProgress((progress) => {
      if (progress.requestId !== requestId) {
        return
      }

      onProgress({
        phase: progress.phase,
        receivedBytes: progress.receivedBytes,
        totalBytes: progress.totalBytes,
        percentage: progress.percentage
      })
    })

    try {
      await window.dboltAppUpdate.downloadAndOpenInstaller({
        url: release.url,
        fileName: release.fileName,
        requestId
      })
    } finally {
      removeProgressListener()
    }
  }

  private createRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

