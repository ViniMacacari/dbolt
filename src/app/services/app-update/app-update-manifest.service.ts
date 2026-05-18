import { Injectable } from '@angular/core'

import {
  AppDownloadsManifest,
  AppUpdatePlatformId,
  AppUpdatePlatformInfo
} from './app-update.model'

@Injectable({
  providedIn: 'root'
})
export class AppUpdateManifestService {
  isNativeUpdateApiAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.dboltAppUpdate)
  }

  async getPlatformInfo(): Promise<AppUpdatePlatformInfo> {
    const nativeApi = this.getNativeApi()
    const platformInfo = await nativeApi.getPlatform()

    return {
      platform: this.normalizePlatform(platformInfo.platform),
      canOpenInstaller: Boolean(platformInfo.canOpenInstaller)
    }
  }

  async getDownloadsManifest(): Promise<AppDownloadsManifest> {
    const nativeApi = this.getNativeApi()
    const manifest = await nativeApi.getDownloadsManifest()

    if (!this.isDownloadsManifest(manifest)) {
      throw new Error('Invalid update manifest.')
    }

    return manifest
  }

  private getNativeApi(): NonNullable<Window['dboltAppUpdate']> {
    if (!window.dboltAppUpdate) {
      throw new Error('Native update API is unavailable.')
    }

    return window.dboltAppUpdate
  }

  private normalizePlatform(platform: string): AppUpdatePlatformId {
    return platform === 'windows' || platform === 'linux' || platform === 'macos'
      ? platform
      : 'unknown'
  }

  private isDownloadsManifest(value: unknown): value is AppDownloadsManifest {
    if (!value || typeof value !== 'object') {
      return false
    }

    const record = value as Record<string, unknown>

    return typeof record['schemaVersion'] === 'number' &&
      Array.isArray(record['platforms']) &&
      Array.isArray(record['releases'])
  }
}

